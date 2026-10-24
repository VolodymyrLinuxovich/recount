import gzip


from conftest import FIXTURES
from src.http import ByteStream
from src.mrf import parse_money, scan_stream
import src.mrf as mrf


def stream_of(data: bytes, chunk: int = 97, max_bytes: int = 10**9) -> ByteStream:
    chunks = (data[i:i + chunk] for i in range(0, len(data), chunk))
    return ByteStream(chunks, max_bytes)


def test_parse_money():
    assert parse_money('6,084.00') == 6084.0
    assert parse_money('$12.5') == 12.5
    assert parse_money('') is None
    assert parse_money('N/A') is None
    assert parse_money(7) == 7.0


def test_json_v3_prices_and_header():
    res = scan_stream(stream_of((FIXTURES / 'mrf_v3.json').read_bytes()), ['99284', '80053', '00000'])
    assert res.format == 'json'
    assert res.version == '3.0.0'
    assert res.lastUpdated == '2026-04-01'
    assert res.hospitalNameInFile == 'Example General Hospital'
    er = res.prices['99284']
    assert er['grossCharge'] == 8501.0 and er['discountedCash'] == 2550.3
    # min/max come from a separate (outpatient) line in the file and are labelled as such
    assert (er['min'], er['max'], er['minMaxSetting']) == (610.38, 1220.77, 'outpatient')
    cmp_ = res.prices['80053']
    # the CDM line whose number equals "80053" must not be used
    assert cmp_['description'] == 'Comprehensive metabolic panel'
    assert cmp_['grossCharge'] == 667.0
    assert (cmp_['payerRateLow'], cmp_['payerRateHigh'], cmp_['payerRateCount']) == (10.56, 21.12, 2)
    assert res.prices['00000'] is None


def test_json_with_bom_and_gzip():
    raw = b'\xef\xbb\xbf' + (FIXTURES / 'mrf_v3.json').read_bytes()
    res = scan_stream(stream_of(gzip.compress(raw)), ['99284'])
    assert res.error is None
    assert res.prices['99284']['grossCharge'] == 8501.0


def test_csv_tall():
    res = scan_stream(stream_of((FIXTURES / 'mrf_tall.csv').read_bytes()), ['99284', '80053'])
    assert res.format == 'csv-tall'
    assert res.hospitalNameInFile == 'EXAMPLE COUNTY HOSPITAL'
    assert res.lastUpdated == '3/19/2026' and res.version == '3.0.0'
    er = res.prices['99284']
    assert er['setting'] == 'outpatient'  # outpatient preferred over inpatient
    assert er['grossCharge'] == 6084.0 and er['discountedCash'] == 6084.0
    assert er['min'] == 49.6 and er['max'] == 6084.0
    assert er['payerRateCount'] == 1  # percentage-only row has no dollar amount
    assert er['totalLines'] == 2
    lab = res.prices['80053']
    assert (lab['min'], lab['payerRateLow'], lab['payerRateHigh']) == (10.56, 10.56, 13.18)


def test_csv_wide():
    res = scan_stream(stream_of((FIXTURES / 'mrf_wide.csv').read_bytes()), ['85025', '99213'])
    assert res.format == 'csv-wide'
    cbc = res.prices['85025']
    assert (cbc['grossCharge'], cbc['discountedCash'], cbc['min'], cbc['max']) == (232.0, 69.6, 7.77, 15.54)
    assert cbc['payerRateCount'] == 2
    assert res.prices['99213']['discountedCash'] is None


def test_early_stop(monkeypatch):
    monkeypatch.setattr(mrf, 'GRACE_CSV_ROWS', 2)
    filler = ''.join(f'Filler {i},{i},CDM,,,,outpatient,facility,1,1,X,Y,1,,,fee schedule,1,1,\n' for i in range(50))
    data = (FIXTURES / 'mrf_tall.csv').read_text() + filler
    res = scan_stream(stream_of(data.encode()), ['99284', '80053'])
    assert res.stopped_early
    assert res.records < 20


def test_size_cap_and_html_detection():
    data = (FIXTURES / 'mrf_tall.csv').read_bytes()
    bs = stream_of(data, chunk=200, max_bytes=600)
    res = scan_stream(bs, ['80053'])
    assert bs.capped
    assert res.prices['80053'] is None
    html = scan_stream(stream_of(b'<!DOCTYPE html><html></html>'), ['1'])
    assert 'HTML' in html.error


def test_non_template_csv_is_reported():
    res = scan_stream(stream_of(b'a,b,c\n1,2,3\n'), ['99284'])
    assert res.error and 'header' in res.error
