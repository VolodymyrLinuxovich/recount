"""Single entry point: rebuild every file in out/.

    python -I scripts/build_all.py            # everything
    python -I scripts/build_all.py --only zsfg ucsf   # just these MRFs (+ fpl/law/hcai)
    python -I scripts/build_all.py --skip-mrf # no price files

Steps
1. fpl.json         <- HHS Federal Register PDF (scripts/fpl.py)
2. ca_law.json      <- copied from scripts/curated/ (hand-written from statute + HCAI sources)
3. hospitals.json   <- copied from scripts/curated/ (FAP thresholds read by hand from the PDFs)
4. hcai_policies.json + raw/fap/*.pdf <- HCAI policy lookup scrape (scripts/hcai.py)
5. prices_<key>.json <- each hospital's CMS MRF, streamed (scripts/mrf_extract.py);
   raw MRFs over 300 MB are deleted after extraction.
"""
import argparse
import os
import shutil
import sys

# -I drops the script dir from sys.path; add the project root so `scripts.*` imports work.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scripts import fpl, hcai, mrf_extract  # noqa: E402
from scripts.common import CURATED, OUT, fetch, raw_path  # noqa: E402

MAX_KEEP_BYTES = 300 * 1024 * 1024

MRFS = {
    "zsfg": {"url": "https://sanfranciscogeneralhospitalfou.box.com/shared/static/bj0pj6iqcpc6bmb4yp7kobuz772j0jtl.csv",
             "file": "zsfg_mrf.csv"},
    "ucsf": {"url": "https://app.box.com/index.php?rm=box_download_shared_file&shared_name=ldckxfm5nm9wah74gqi7fdhe6mrtpg5e&file_id=f_1959275070690",
             "file": "ucsf_mrf.json"},
    "cpmc_vanness": {"url": "https://edge.sitecorecloud.io/sutterhealt962c-sutterhealt8fce-production57cc-4860/media/Project/SutterHealth/SutterHealth/Files/billing-insurance/costs-and-charges/940562680-1740348929_california-pacific-medical-center-van-ness-campus_standardcharges.csv",
                     "file": "cpmc_vanness_mrf.csv"},
    "stfrancis_hyde": {"url": "https://app.box.com/index.php?rm=box_download_shared_file&shared_name=8wogrqzbbev45c7pup8v9298ul2ymlpr&file_id=f_1732346032300",
                       "file": "stfrancis_mrf.json"},
    "stmarys": {"url": "https://app.box.com/index.php?rm=box_download_shared_file&shared_name=xsx8jxwcakpxzg78pfllolwmhrhcifxh&file_id=f_1732344688129",
                "file": "stmarys_mrf.json"},
    "kaiser_sf": {"url": "https://healthy.kaiserpermanente.org/content/dam/kporg/final/documents/health-plan-documents/coverage-information/machine-readable/941105628-san-francisco-medical-center-standard-charges-ncal-en.csv",
                  "warmup": "https://healthy.kaiserpermanente.org/northern-california/doctors-locations/price-transparency",
                  "file": "kaiser_sf_mrf.csv"},
}


def build_prices(key):
    cfg = MRFS[key]
    path = raw_path("mrf", cfg["file"])
    if not os.path.exists(path):
        print(f"  downloading {key} MRF ...")
        fetch(cfg["url"], path, warmup=cfg.get("warmup"), timeout=1800)
    size = os.path.getsize(path)
    res = mrf_extract.extract(path, os.path.join(OUT, f"prices_{key}.json"), key, cfg["url"])
    print(f"  {key}: {size/1e6:.1f} MB, updated {res['mrf_last_updated_on']}, missing {res['codes_not_found']}")
    if size > MAX_KEEP_BYTES:
        os.remove(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*", help="MRF keys to build (default: all)")
    ap.add_argument("--skip-mrf", action="store_true")
    ap.add_argument("--skip-hcai", action="store_true")
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)

    print("fpl.json"); fpl.build()
    for name in ("ca_law.json", "hospitals.json"):
        print(name); shutil.copyfile(os.path.join(CURATED, name), os.path.join(OUT, name))
    if not a.skip_hcai:
        print("hcai_policies.json"); hcai.build()
    if not a.skip_mrf:
        for key in (a.only or MRFS):
            print(f"prices_{key}.json")
            try:
                build_prices(key)
            except Exception as e:  # keep going; one hospital's site being down shouldn't block the rest
                print(f"  FAILED {key}: {e!r}")


if __name__ == "__main__":
    main()
