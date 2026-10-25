//! Per-item numbers and the running totals over a whole file.

use serde::Serialize;

/// Prices within half a cent count as equal.
const CENT: f64 = 0.005;

/// A plain number, as CMS requires: no "$", no thousands separators, finite.
pub fn num(s: &str) -> Option<f64> {
    let t = s.trim();
    if t.is_empty() {
        return None;
    }
    t.parse::<f64>().ok().filter(|v| v.is_finite())
}

/// One standard charge: an item or service at one setting, with every payer's dollar rate.
/// Prices and payer rates are only compared when the file puts them on the same item.
#[derive(Clone, Copy, Debug, Default)]
pub struct Item {
    pub gross: Option<f64>,
    pub cash: Option<f64>,
    pub file_min: Option<f64>,
    pub file_max: Option<f64>,
    pub neg_min: Option<f64>,
    pub neg_max: Option<f64>,
    pub n_negotiated: u32,
}

impl Item {
    pub fn new(gross: Option<f64>, cash: Option<f64>, file_min: Option<f64>, file_max: Option<f64>) -> Self {
        Item { gross, cash, file_min, file_max, ..Default::default() }
    }

    pub fn add_negotiated(&mut self, v: f64) {
        self.n_negotiated += 1;
        self.neg_min = Some(self.neg_min.map_or(v, |m| m.min(v)));
        self.neg_max = Some(self.neg_max.map_or(v, |m| m.max(v)));
    }

    /// The file's own de-identified min and max should bound every payer dollar rate.
    pub fn outside_min_max(&self) -> bool {
        let below = matches!((self.neg_min, self.file_min), (Some(n), Some(m)) if n < m - CENT);
        let above = matches!((self.neg_max, self.file_max), (Some(n), Some(m)) if n > m + CENT);
        below || above
    }
}

/// Running totals over every item in a file. Ratios are kept for medians.
#[derive(Debug, Default)]
pub struct Stats {
    pub items: u64,
    pub with_gross_and_cash: u64,
    pub cash_equals_gross: u64,
    pub cash_below_gross: u64,
    pub cash_above_gross: u64,
    pub gross_without_cash: u64,
    pub discount_pct: Vec<f64>,
    pub with_cash_and_insurer: u64,
    pub cash_above_every_insurer: u64,
    pub lowest_insurer_pct_of_cash: Vec<f64>,
    pub negotiated_rates: u64,
    pub outside_min_max: u64,
    pub min_above_max: u64,
    /// Items with a price and items with a payer rate, to tell when a file never pairs them.
    pub items_with_price: u64,
    pub items_with_insurer_rate: u64,
}

impl Stats {
    pub fn add(&mut self, it: &Item) {
        self.items += 1;
        self.negotiated_rates += it.n_negotiated as u64;
        self.outside_min_max += it.outside_min_max() as u64;
        self.items_with_price += (it.gross.is_some() || it.cash.is_some()) as u64;
        self.items_with_insurer_rate += (it.n_negotiated > 0) as u64;
        if let (Some(lo), Some(hi)) = (it.file_min, it.file_max) {
            if lo > hi + CENT {
                self.min_above_max += 1;
            }
        }
        match (it.gross, it.cash) {
            (Some(g), Some(c)) => {
                self.with_gross_and_cash += 1;
                if (c - g).abs() <= CENT {
                    self.cash_equals_gross += 1;
                } else if c < g {
                    self.cash_below_gross += 1;
                } else {
                    self.cash_above_gross += 1;
                }
                if g > 0.0 {
                    self.discount_pct.push((1.0 - c / g) * 100.0);
                }
            }
            (Some(_), None) => self.gross_without_cash += 1,
            _ => {}
        }
        if let (Some(c), Some(lo), Some(hi)) = (it.cash, it.neg_min, it.neg_max) {
            if c > 0.0 {
                self.with_cash_and_insurer += 1;
                self.lowest_insurer_pct_of_cash.push(lo / c * 100.0);
                if c > hi + CENT {
                    self.cash_above_every_insurer += 1;
                }
            }
        }
    }
}

pub fn median(xs: &mut [f64]) -> Option<f64> {
    if xs.is_empty() {
        return None;
    }
    xs.sort_by(|a, b| a.total_cmp(b));
    let m = xs.len() / 2;
    Some(if xs.len() % 2 == 1 { xs[m] } else { (xs[m - 1] + xs[m]) / 2.0 })
}

/// Share as a percent with one decimal, or None when there's nothing to divide by.
pub fn pct(n: u64, of: u64) -> Option<f64> {
    (of > 0).then(|| (n as f64 / of as f64 * 1000.0).round() / 10.0)
}

pub fn round1(x: Option<f64>) -> Option<f64> {
    x.map(|v| (v * 10.0).round() / 10.0)
}

#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct CashSummary {
    pub items_with_gross_and_cash: u64,
    pub cash_equals_gross: u64,
    pub cash_equals_gross_pct: Option<f64>,
    pub cash_below_gross: u64,
    pub cash_above_gross: u64,
    pub gross_without_cash: u64,
    pub median_cash_discount_pct: Option<f64>,
}

#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct InsurerSummary {
    pub negotiated_dollar_rates: u64,
    pub items_with_price: u64,
    pub items_with_insurer_rate: u64,
    /// False when the file never lists a cash price and a payer rate on the same item
    /// (CPMC and UCSF list chargemaster prices and payer rates as separate items).
    pub paired_in_file: bool,
    pub items_with_cash_and_insurer_rate: u64,
    pub median_lowest_insurer_rate_pct_of_cash: Option<f64>,
    pub cash_above_every_insurer: u64,
    pub cash_above_every_insurer_pct: Option<f64>,
}

#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Consistency {
    /// Items with a payer dollar rate below the file's own min or above its own max.
    pub items_rates_outside_file_min_max: u64,
    pub items_min_above_max: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn numbers_must_be_plain() {
        assert_eq!(num(" 402.00 "), Some(402.0));
        assert_eq!(num("1e3"), Some(1000.0));
        assert_eq!(num("$402"), None);
        assert_eq!(num("1,200"), None);
        assert_eq!(num("N/A"), None);
        assert_eq!(num(""), None);
        assert_eq!(num("inf"), None);
    }

    #[test]
    fn cash_equal_below_above() {
        let mut s = Stats::default();
        s.add(&Item::new(Some(402.0), Some(402.004), None, None));
        s.add(&Item::new(Some(402.0), Some(120.6), None, None));
        s.add(&Item::new(Some(100.0), Some(150.0), None, None));
        s.add(&Item::new(Some(100.0), None, None, None));
        assert_eq!((s.cash_equals_gross, s.cash_below_gross, s.cash_above_gross, s.gross_without_cash), (1, 1, 1, 1));
        assert_eq!(s.with_gross_and_cash, 3);
        assert_eq!(round1(median(&mut s.discount_pct)), Some(0.0));
    }

    #[test]
    fn insurer_rates_against_cash() {
        let mut it = Item::new(Some(1000.0), Some(1000.0), Some(50.0), Some(400.0));
        it.add_negotiated(50.0);
        it.add_negotiated(400.0);
        it.add_negotiated(401.0); // above the file's own max
        let mut s = Stats::default();
        s.add(&it);
        assert_eq!(s.cash_above_every_insurer, 1);
        assert_eq!(s.lowest_insurer_pct_of_cash, vec![5.0]);
        assert_eq!(s.outside_min_max, 1);
        assert_eq!(s.negotiated_rates, 3);
    }

    #[test]
    fn prices_and_rates_on_separate_items() {
        // CPMC and UCSF style: prices on one item, payer rates on another.
        let mut s = Stats::default();
        s.add(&Item::new(Some(400.0), Some(400.0), None, None));
        let mut rates = Item::default();
        rates.add_negotiated(80.0);
        s.add(&rates);
        assert_eq!((s.items_with_price, s.items_with_insurer_rate, s.with_cash_and_insurer), (1, 1, 0));
    }

    #[test]
    fn min_above_max_is_counted() {
        let mut s = Stats::default();
        s.add(&Item::new(None, None, Some(10.0), Some(5.0)));
        assert_eq!(s.min_above_max, 1);
    }

    #[test]
    fn medians() {
        assert_eq!(median(&mut []), None);
        assert_eq!(median(&mut [3.0, 1.0, 2.0]), Some(2.0));
        assert_eq!(median(&mut [4.0, 1.0, 3.0, 2.0]), Some(2.5));
        assert_eq!(pct(1, 3), Some(33.3));
        assert_eq!(pct(1, 0), None);
    }
}
