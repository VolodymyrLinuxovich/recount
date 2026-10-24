from src.main import _jobs


def test_single_input_is_one_job():
    assert _jobs({'hospitalUrl': 'a.org', 'codes': ['99284']}) == [{'hospitalUrl': 'a.org', 'codes': ['99284']}]


def test_batch_entries_inherit_shared_settings():
    jobs = _jobs({'codes': ['99284'], 'maxMrfMB': 50, 'hospitals': [
        {'hospitalUrl': 'a.org', 'key': 'a'},
        {'hospitalUrl': 'b.org', 'codes': ['80053'], 'mrfUrl': ''},
        'c.org',
    ]})
    assert jobs[0] == {'codes': ['99284'], 'maxMrfMB': 50, 'hospitalUrl': 'a.org', 'key': 'a'}
    # An entry's own codes win; empty values don't override shared ones.
    assert jobs[1] == {'codes': ['80053'], 'maxMrfMB': 50, 'hospitalUrl': 'b.org'}
    assert jobs[2]['hospitalUrl'] == 'c.org'
    assert all('hospitals' not in j for j in jobs)


def test_vendor_download_links_score_by_packed_name():
    from src.locate import score_mrf_link
    base = 'https://apps.para-hcfs.com/PTT/FinalLinks/Reports.aspx?dbName={}&type=CDMWithoutLabel&fileType=CSV'
    mine = score_mrf_link(base.format('dbAHCLCLEARLAKECA'), 'Standard Charges CSV', 'Adventist Health Clearlake')
    other = score_mrf_link(base.format('dbAHLMLODICA'), 'Standard Charges CSV', 'Adventist Health Clearlake')
    assert mine > other > 0
    # A plain .aspx page with no file format is still not a price file.
    assert score_mrf_link('https://x.org/prices.aspx', 'Standard charges', 'X') == 0
