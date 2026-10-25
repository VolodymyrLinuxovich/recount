//! The per-file report, file metadata checks (dates, NPIs), and the markdown table.

use serde::Serialize;

use crate::stats::{median, pct, round1, CashSummary, Consistency, InsurerSummary, Stats};

/// General data elements from the top of the file.
#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Meta {
    pub hospital_name: Option<String>,
    pub version: Option<String>,
    pub last_updated_on: Option<String>,
    pub attestation_confirmed: Option<bool>,
    #[serde(skip)]
    pub npis: Vec<String>,
}

#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct NpiCheck {
    pub count: usize,
    /// NPIs that fail the check digit (Luhn over "80840" + the NPI) or aren't 10 digits.
    pub invalid: Vec<String>,
}

#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct FileReport {
    pub key: String,
    pub layout: String,
    #[serde(flatten)]
    pub meta: Meta,
    pub last_updated_iso: Option<String>,
    pub days_since_update: Option<i64>,
    /// 45 CFR 180.50(e): update at least once every 12 months.
    pub older_than_12_months: Option<bool>,
    pub type_2_npis: NpiCheck,
    pub payer_plans: Option<usize>,
    pub rows_scanned: u64,
    pub charge_items: u64,
    pub cash: CashSummary,
    pub insurers: InsurerSummary,
    pub consistency: Consistency,
    pub seconds: f64,
}

impl FileReport {
    pub fn finish(&mut self, mut s: Stats, today: i64) {
        let updated = self.meta.last_updated_on.as_deref().and_then(parse_date);
        self.last_updated_iso = updated.map(iso);
        self.days_since_update = updated.map(|d| today - d);
        self.older_than_12_months = self.days_since_update.map(|n| n > 365);
        self.type_2_npis = NpiCheck {
            count: self.meta.npis.len(),
            invalid: self.meta.npis.iter().filter(|n| !npi_valid(n)).cloned().collect(),
        };
        self.charge_items = s.items;
        self.cash = CashSummary {
            items_with_gross_and_cash: s.with_gross_and_cash,
            cash_equals_gross: s.cash_equals_gross,
            cash_equals_gross_pct: pct(s.cash_equals_gross, s.with_gross_and_cash),
            cash_below_gross: s.cash_below_gross,
            cash_above_gross: s.cash_above_gross,
            gross_without_cash: s.gross_without_cash,
            median_cash_discount_pct: round1(median(&mut s.discount_pct)),
        };
        self.insurers = InsurerSummary {
            negotiated_dollar_rates: s.negotiated_rates,
            items_with_price: s.items_with_price,
            items_with_insurer_rate: s.items_with_insurer_rate,
            paired_in_file: s.with_cash_and_insurer > 0,
            items_with_cash_and_insurer_rate: s.with_cash_and_insurer,
            median_lowest_insurer_rate_pct_of_cash: round1(median(&mut s.lowest_insurer_pct_of_cash)),
            cash_above_every_insurer: s.cash_above_every_insurer,
            cash_above_every_insurer_pct: pct(s.cash_above_every_insurer, s.with_cash_and_insurer),
        };
        self.consistency = Consistency {
            items_rates_outside_file_min_max: s.outside_min_max,
            items_min_above_max: s.min_above_max,
        };
    }
}

/// An NPI is 10 digits whose last digit is a Luhn check digit over "80840" + the first 9.
pub fn npi_valid(npi: &str) -> bool {
    if npi.len() != 10 || !npi.bytes().all(|b| b.is_ascii_digit()) {
        return false;
    }
    let digits: Vec<u32> = "80840".bytes().chain(npi.bytes()).map(|b| (b - b'0') as u32).collect();
    let sum: u32 = digits
        .iter()
        .rev()
        .enumerate()
        .map(|(i, &d)| if i % 2 == 1 { let x = d * 2; if x > 9 { x - 9 } else { x } } else { d })
        .sum();
    sum % 10 == 0
}

// ------------------------------------------------------------ dates (days since 1970-01-01)

fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let doy = (153 * (m + if m > 2 { -3 } else { 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719468;
    let era = z.div_euclid(146097);
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (yoe + era * 400 + if m <= 2 { 1 } else { 0 }, m, d)
}

/// "2026-04-01", or the M/D/YYYY and MM/DD/YYYY forms CMS also accepts in CSV.
pub fn parse_date(s: &str) -> Option<i64> {
    let s = s.trim();
    let p: Vec<&str> = s.split(['-', '/']).collect();
    if p.len() != 3 || !p.iter().all(|x| !x.is_empty() && x.bytes().all(|b| b.is_ascii_digit())) {
        return None;
    }
    let n: Vec<i64> = p.iter().map(|x| x.parse().unwrap()).collect();
    let (y, m, d) = if s.contains('-') && p[0].len() == 4 {
        (n[0], n[1], n[2])
    } else if s.contains('/') && p[2].len() == 4 {
        (n[2], n[0], n[1])
    } else {
        return None;
    };
    if !(1..=12).contains(&m) || d < 1 || d > 31 {
        return None;
    }
    let days = days_from_civil(y, m, d);
    // Reject dates like 2026-02-30 that roll into the next month.
    (civil_from_days(days) == (y, m, d)).then_some(days)
}

pub fn iso(days: i64) -> String {
    let (y, m, d) = civil_from_days(days);
    format!("{y:04}-{m:02}-{d:02}")
}

pub fn today() -> i64 {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    secs.div_euclid(86400)
}

// ------------------------------------------------------------ markdown

fn opt<T: std::fmt::Display>(v: Option<T>, suffix: &str) -> String {
    v.map(|x| format!("{x}{suffix}")).unwrap_or_else(|| "n/a".into())
}

pub fn markdown(reports: &[FileReport], today: i64) -> String {
    let mut s = format!(
        "Price file audit, as of {}\n\n\
         | Hospital | Format | Updated | Items | Cash = full price | Median cash discount | Lowest insurer rate, % of cash | Cash above every insurer | NPIs OK | Seconds |\n\
         |---|---|---|---:|---:|---:|---:|---:|---|---:|\n",
        iso(today)
    );
    for r in reports {
        let npis = if r.type_2_npis.invalid.is_empty() {
            format!("{} of {}", r.type_2_npis.count, r.type_2_npis.count)
        } else {
            format!("{} bad: {}", r.type_2_npis.invalid.len(), r.type_2_npis.invalid.join(", "))
        };
        // A file can list prices and payer rates as separate items; say so instead of "n/a".
        let unpaired = |v: Option<f64>| {
            if !r.insurers.paired_in_file && r.insurers.items_with_insurer_rate > 0 {
                "not paired".to_string()
            } else {
                opt(v, "%")
            }
        };
        s += &format!(
            "| {} | {} v{} | {} | {} | {} | {} | {} | {} | {} | {} |\n",
            r.meta.hospital_name.as_deref().unwrap_or(&r.key),
            r.layout,
            r.meta.version.as_deref().unwrap_or("?"),
            r.last_updated_iso.as_deref().unwrap_or("?"),
            r.charge_items,
            opt(r.cash.cash_equals_gross_pct, "%"),
            opt(r.cash.median_cash_discount_pct, "%"),
            unpaired(r.insurers.median_lowest_insurer_rate_pct_of_cash),
            unpaired(r.insurers.cash_above_every_insurer_pct),
            npis,
            r.seconds,
        );
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn npi_check_digit() {
        assert!(npi_valid("1234567893")); // the CMS example NPI
        assert!(!npi_valid("1234567890"));
        assert!(!npi_valid("123456789"));
        assert!(!npi_valid("12345678a3"));
    }

    #[test]
    fn dates() {
        assert_eq!(parse_date("2026-04-01").map(iso).as_deref(), Some("2026-04-01"));
        assert_eq!(parse_date("3/19/2026").map(iso).as_deref(), Some("2026-03-19"));
        assert_eq!(parse_date("03/19/2026").map(iso).as_deref(), Some("2026-03-19"));
        assert_eq!(parse_date("2026-02-30"), None);
        assert_eq!(parse_date("19/3/26"), None);
        assert_eq!(parse_date("April 1"), None);
        assert_eq!(parse_date("2024-02-29").map(iso).as_deref(), Some("2024-02-29"));
        assert_eq!(parse_date("1970-01-01"), Some(0));
        assert_eq!(parse_date("2026-10-24").unwrap() - parse_date("2025-10-24").unwrap(), 365);
    }
}
