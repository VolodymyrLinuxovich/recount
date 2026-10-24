from conftest import FIXTURES
from src.fpl import extract_thresholds, find_phones
from src.locate import parse_cms_txt, score_fap_doc, score_mrf_link


def load(name):
    return (FIXTURES / name).read_text()


def test_county_policy_ignores_history_and_law_restatements():
    r = extract_thresholds(load('fap_county.txt'))
    assert r['freeCareMaxFplPct'] == 138
    assert r['discountMaxFplPct'] is None
    assert r['discountHasNoFplCap'] is True
    texts = {q['kind']: q['text'] for q in r['quotes']}
    assert texts['freeCare'] == "A patient's household income may not exceed 138% of the Federal poverty level."
    assert 'no FPL limit' in texts['discountNoCap']
    # every quote is verbatim from the source text
    flat = ' '.join(load('fap_county.txt').split())
    for q in r['quotes']:
        assert q['text'] in flat


def test_tiered_policy_ranges():
    r = extract_thresholds(load('fap_tiered.txt'))
    assert r['freeCareMaxFplPct'] == 200
    assert r['discountMaxFplPct'] == 400
    assert r['discountHasNoFplCap'] is False


def test_single_tier_policy():
    r = extract_thresholds(load('fap_single_tier.txt'))
    assert r['freeCareMaxFplPct'] == 400
    assert r['discountMaxFplPct'] == 400


def test_no_numbers_means_null_not_guess():
    r = extract_thresholds(load('fap_no_numbers.txt'))
    assert r['freeCareMaxFplPct'] is None
    assert r['discountMaxFplPct'] is None
    assert r['quotes'] == []


def test_phone_prefers_financial_assistance_and_skips_fax():
    phones = find_phones(load('fap_county.txt'))
    assert phones[0][1] == '(628) 206-3275'
    assert all(p[1] != '(628) 206-0000' for p in phones)
    assert find_phones(load('fap_tiered.txt'))[0][1] == '(800) 555-0199'


def test_parse_cms_txt():
    txt = """location-name: Example Hospital A
source-page-url: https://example.org/prices
mrf-url: https://example.org/a_standardcharges.json
contact-name: Jane Doe
contact-email: prices@example.org

location-name: Example Hospital B
source-page-url: https://example.org/prices
mrf-url: https://example.org/b_standardcharges.csv
contact-name: Jane Doe
contact-email: prices@example.org
"""
    entries = parse_cms_txt(txt)
    assert [e['location-name'] for e in entries] == ['Example Hospital A', 'Example Hospital B']
    assert entries[1]['mrf-url'].endswith('b_standardcharges.csv')


def test_link_scoring():
    mrf_a = score_mrf_link('https://app.box.com/index.php?rm=box_download_shared_file&file_id=1', 'UCSF Medical Center Standard Charges', None, 'https://www.ucsfhealth.org')
    mrf_b = score_mrf_link('https://app.box.com/index.php?rm=box_download_shared_file&file_id=2', 'Langley Porter Psychiatric Hospital and Clinics Standard Charges', None, 'https://www.ucsfhealth.org')
    assert mrf_a > mrf_b > 0
    assert score_mrf_link('https://x.org/cdm.xlsx', 'Charge description master', None) == 0
    assert score_fap_doc('https://x.org/patient_financial_assistance_policy.pdf', 'Patient Financial Assistance Policy') > \
        score_fap_doc('https://x.org/financial_assistance_application.pdf', 'Financial Assistance Application')
    assert score_fap_doc('https://x.org/debt-collection.pdf', 'Debt Collection Policy') < 4
