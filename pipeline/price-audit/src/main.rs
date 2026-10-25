//! price_audit: stream hospital price transparency files (CMS template v2/v3, CSV tall,
//! CSV wide or JSON) and report what an uninsured patient is quoted next to what
//! insurers pay. Format rules are left to the official CMS validator
//! (@cmsgov/hpt-validator-cli); this tool reads the numbers.
//!
//!   price_audit [--today YYYY-MM-DD] [--json report.json] <key=file>...
//!
//! Each file is read once, front to back, in constant memory for wide CSV and JSON.
//! Tall CSV repeats an item once per payer, so it keeps one small record per item.

mod report;
mod stats;

use std::collections::HashMap;
use std::fs::File;
use std::hash::{DefaultHasher, Hash, Hasher};
use std::io::{self, BufRead, BufReader, Read};
use std::time::Instant;

use serde::de::{DeserializeSeed, Deserializer, IgnoredAny, MapAccess, SeqAccess, Visitor};
use serde_json::Value;

use report::{FileReport, Meta};
use stats::{num, Item, Stats};

/// Open a file and skip a UTF-8 byte order mark if there is one.
fn open(path: &str) -> io::Result<BufReader<File>> {
    let mut r = BufReader::with_capacity(1 << 20, File::open(path)?);
    if r.fill_buf()?.starts_with(&[0xEF, 0xBB, 0xBF]) {
        r.consume(3);
    }
    Ok(r)
}

/// JSON if the first non-space byte is `{`, CSV otherwise.
fn is_json(path: &str) -> io::Result<bool> {
    let mut r = open(path)?;
    let mut head = [0u8; 4096];
    let n = r.read(&mut head)?;
    Ok(head[..n].iter().find(|b| !b.is_ascii_whitespace()) == Some(&b'{'))
}

/// Lowercase, and drop the spaces CMS allows around pipes: "standard_charge| Gross" -> "standard_charge|gross".
pub fn norm_header(h: &str) -> String {
    h.split('|').map(|p| p.trim().to_lowercase()).collect::<Vec<_>>().join("|")
}

// ---------------------------------------------------------------- CSV

fn read_csv(path: &str, rep: &mut FileReport) -> Result<Stats, Box<dyn std::error::Error>> {
    let mut rdr = csv::ReaderBuilder::new()
        .has_headers(false)
        .flexible(true)
        .buffer_capacity(1 << 20)
        .from_reader(open(path)?);
    let mut rec = csv::ByteRecord::new();
    let mut row = |rdr: &mut csv::Reader<BufReader<File>>| -> Result<Vec<String>, csv::Error> {
        rdr.read_byte_record(&mut rec)?;
        Ok(rec.iter().map(|f| String::from_utf8_lossy(f).trim().to_string()).collect())
    };
    let keys = row(&mut rdr)?;
    let vals = row(&mut rdr)?;
    let header: Vec<String> = row(&mut rdr)?.iter().map(|h| norm_header(h)).collect();

    // Row 1 holds the general data element names, row 2 their values.
    let mut meta = Meta::default();
    for (k, v) in keys.iter().zip(vals.iter()) {
        let k = norm_header(k);
        match k.as_str() {
            "hospital_name" => meta.hospital_name = Some(v.clone()),
            "last_updated_on" => meta.last_updated_on = Some(v.clone()),
            "version" => meta.version = Some(v.clone()),
            "type_2_npi" => meta.npis = v.split('|').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect(),
            _ if k.starts_with("to the best of its knowledge") => {
                meta.attestation_confirmed = Some(v.eq_ignore_ascii_case("true"))
            }
            _ => {}
        }
    }
    rep.meta = meta;

    let col = |name: &str| header.iter().position(|h| h == name);
    let gross = col("standard_charge|gross");
    let cash = col("standard_charge|discounted_cash");
    let fmin = col("standard_charge|min");
    let fmax = col("standard_charge|max");
    let tall_dollar = col("standard_charge|negotiated_dollar");
    // Wide: one "standard_charge|<payer>|<plan>|negotiated_dollar" column per payer and plan.
    let wide_dollars: Vec<usize> = header
        .iter()
        .enumerate()
        .filter(|(_, h)| {
            let p: Vec<&str> = h.split('|').collect();
            p.len() == 4 && p[0] == "standard_charge" && p[3] == "negotiated_dollar"
        })
        .map(|(i, _)| i)
        .collect();
    let wide = !wide_dollars.is_empty();
    rep.layout = if wide { "CSV wide" } else { "CSV tall" }.into();
    rep.payer_plans = if wide { Some(wide_dollars.len()) } else { None };

    // Tall CSV repeats an item once per payer. Rows are the same item when every
    // non-payer column matches, prices included.
    let item_cols: Vec<usize> = header
        .iter()
        .enumerate()
        .filter(|(_, h)| {
            matches!(
                h.as_str(),
                "description" | "setting" | "billing_class" | "modifiers" | "modifier"
                    | "drug_unit_of_measurement" | "drug_type_of_measurement"
                    | "standard_charge|gross" | "standard_charge|discounted_cash"
                    | "standard_charge|min" | "standard_charge|max"
            ) || h.starts_with("code|")
        })
        .map(|(i, _)| i)
        .collect();

    let mut st = Stats::default();
    let mut items: HashMap<u64, Item> = HashMap::new();
    let mut order: Vec<u64> = Vec::new();
    while rdr.read_byte_record(&mut rec)? {
        rep.rows_scanned += 1;
        let f = |i: Option<usize>| i.and_then(|i| rec.get(i)).and_then(|b| std::str::from_utf8(b).ok()).and_then(num);
        let fresh = Item::new(f(gross), f(cash), f(fmin), f(fmax));
        if wide {
            let mut it = fresh;
            for &i in &wide_dollars {
                if let Some(v) = f(Some(i)) {
                    it.add_negotiated(v);
                }
            }
            st.add(&it);
        } else {
            let mut h = DefaultHasher::new();
            for &i in &item_cols {
                rec.get(i).unwrap_or(b"").trim_ascii().hash(&mut h);
            }
            let key = h.finish();
            let it = items.entry(key).or_insert_with(|| {
                order.push(key);
                fresh
            });
            if let Some(v) = f(tall_dollar) {
                it.add_negotiated(v);
            }
        }
    }
    for k in order {
        st.add(&items[&k]);
    }
    Ok(st)
}

// ---------------------------------------------------------------- JSON

struct JsonState {
    meta: Meta,
    stats: Stats,
    rows: u64,
}

impl JsonState {
    fn item(&mut self, sci: &Value) {
        self.rows += 1;
        let get = |v: &Value, k: &str| v.get(k).and_then(jnum);
        for sc in sci.get("standard_charges").and_then(Value::as_array).into_iter().flatten() {
            let mut it = Item::new(
                get(sc, "gross_charge"),
                get(sc, "discounted_cash"),
                get(sc, "minimum"),
                get(sc, "maximum"),
            );
            for p in sc.get("payers_information").and_then(Value::as_array).into_iter().flatten() {
                if let Some(v) = get(p, "standard_charge_dollar") {
                    it.add_negotiated(v);
                }
            }
            self.stats.add(&it);
        }
    }

    fn meta_value(&mut self, k: &str, v: Value) {
        let s = |v: &Value| match v {
            Value::String(s) => Some(s.trim().to_string()),
            Value::Number(n) => Some(n.to_string()),
            _ => None,
        };
        match k {
            "hospital_name" => self.meta.hospital_name = s(&v),
            "last_updated_on" => self.meta.last_updated_on = s(&v),
            "version" => self.meta.version = s(&v),
            "type_2_npi" => {
                self.meta.npis = v.as_array().into_iter().flatten().filter_map(s).filter(|x| !x.is_empty()).collect()
            }
            "attestation" => {
                self.meta.attestation_confirmed = v.get("confirm_attestation").and_then(Value::as_bool)
            }
            _ => {}
        }
    }
}

fn jnum(v: &Value) -> Option<f64> {
    match v {
        Value::Number(n) => n.as_f64().filter(|x| x.is_finite()),
        Value::String(s) => num(s),
        _ => None,
    }
}

const META_KEYS: [&str; 5] = ["hospital_name", "last_updated_on", "version", "type_2_npi", "attestation"];

struct Root<'a>(&'a mut JsonState);
struct ChargeList<'a>(&'a mut JsonState);

impl<'de> DeserializeSeed<'de> for Root<'_> {
    type Value = ();
    fn deserialize<D: Deserializer<'de>>(self, d: D) -> Result<(), D::Error> {
        d.deserialize_map(self)
    }
}

impl<'de> Visitor<'de> for Root<'_> {
    type Value = ();
    fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        f.write_str("a CMS price transparency JSON object")
    }
    fn visit_map<A: MapAccess<'de>>(self, mut m: A) -> Result<(), A::Error> {
        let st = self.0;
        while let Some(k) = m.next_key::<String>()? {
            if k == "standard_charge_information" {
                m.next_value_seed(ChargeList(&mut *st))?;
            } else if META_KEYS.contains(&k.as_str()) {
                let v: Value = m.next_value()?;
                st.meta_value(&k, v);
            } else {
                m.next_value::<IgnoredAny>()?;
            }
        }
        Ok(())
    }
}

impl<'de> DeserializeSeed<'de> for ChargeList<'_> {
    type Value = ();
    fn deserialize<D: Deserializer<'de>>(self, d: D) -> Result<(), D::Error> {
        d.deserialize_seq(self)
    }
}

impl<'de> Visitor<'de> for ChargeList<'_> {
    type Value = ();
    fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        f.write_str("an array of standard charge information objects")
    }
    // One item at a time: only the current item is ever held in memory.
    fn visit_seq<A: SeqAccess<'de>>(self, mut s: A) -> Result<(), A::Error> {
        while let Some(sci) = s.next_element::<Value>()? {
            self.0.item(&sci);
        }
        Ok(())
    }
}

fn read_json(path: &str, rep: &mut FileReport) -> Result<Stats, Box<dyn std::error::Error>> {
    let mut st = JsonState { meta: Meta::default(), stats: Stats::default(), rows: 0 };
    let mut de = serde_json::Deserializer::from_reader(open(path)?);
    Root(&mut st).deserialize(&mut de)?;
    de.end()?;
    rep.layout = "JSON".into();
    rep.meta = st.meta;
    rep.rows_scanned = st.rows;
    Ok(st.stats)
}

// ---------------------------------------------------------------- main

fn audit(key: &str, path: &str, today: i64) -> Result<FileReport, Box<dyn std::error::Error>> {
    let t = Instant::now();
    let mut rep = FileReport { key: key.into(), ..Default::default() };
    let st = if is_json(path)? { read_json(path, &mut rep)? } else { read_csv(path, &mut rep)? };
    rep.finish(st, today);
    rep.seconds = (t.elapsed().as_secs_f64() * 100.0).round() / 100.0;
    Ok(rep)
}

fn main() {
    let mut args = std::env::args().skip(1);
    let mut today = report::today();
    let mut json_out: Option<String> = None;
    let mut files: Vec<(String, String)> = Vec::new();
    while let Some(a) = args.next() {
        match a.as_str() {
            "--today" => {
                let d = args.next().unwrap_or_default();
                today = report::parse_date(&d).unwrap_or_else(|| die(&format!("bad --today date: {d}")));
            }
            "--json" => json_out = args.next(),
            "-h" | "--help" => {
                println!("usage: price_audit [--today YYYY-MM-DD] [--json report.json] <key=file>...");
                return;
            }
            _ => {
                let (k, p) = a.split_once('=').unwrap_or(("", &a));
                let key = if k.is_empty() {
                    std::path::Path::new(p).file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default()
                } else {
                    k.to_string()
                };
                files.push((key, p.to_string()));
            }
        }
    }
    if files.is_empty() {
        die("no files given (try --help)");
    }
    let mut reports = Vec::new();
    for (k, p) in &files {
        match audit(k, p, today) {
            Ok(r) => reports.push(r),
            Err(e) => eprintln!("{k}: could not read {p}: {e}"),
        }
    }
    print!("{}", report::markdown(&reports, today));
    if let Some(out) = json_out {
        let body = serde_json::to_string_pretty(&serde_json::json!({
            "generatedFor": report::iso(today),
            "files": reports,
        }))
        .expect("report serializes");
        std::fs::write(&out, body + "\n").unwrap_or_else(|e| die(&format!("could not write {out}: {e}")));
    }
}

fn die(msg: &str) -> ! {
    eprintln!("price_audit: {msg}");
    std::process::exit(2)
}
