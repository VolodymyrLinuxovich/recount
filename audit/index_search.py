"""Put the audit's policy sentences into an Azure AI Search index, so Lupa can quote a hospital's
own policy (convex/lib/search.ts).

One document per candidate sentence (997): the sentence with a little context, the hospitals whose
policy has it, the rule it was checked against and our audit's final verdict. Each gets a
text-embedding-3-small vector. About 10 MB, well under the Free tier's 50 MB.

Reads the keys from an env file (never pass keys on the command line):
  AZURE_SEARCH_ENDPOINT, AZURE_SEARCH_KEY (an admin key), AZURE_SEARCH_INDEX (default recount-policies)
  AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_EMBEDDING_DEPLOYMENT (default
  text-embedding-3-small), AZURE_OPENAI_API_VERSION (default 2024-10-21)

  python3 -I audit/index_search.py --env .env.azure --dry-run   # show what would be indexed
  python3 -I audit/index_search.py --env .env.azure             # create the index and upload
"""

from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path

_sys.path.insert(0, str(_Path(__file__).resolve().parent))  # -I leaves the script dir off sys.path

import argparse
import json
import time
import urllib.error
import urllib.request
from pathlib import Path

from report import load_decisions  # noqa: E402
from review import load_packets  # noqa: E402

SEARCH_API = "2024-07-01"
DIMS = 1536


def read_env(path: Path) -> dict[str, str]:
    out = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def call(url: str, headers: dict, body: dict | None, method: str = "POST") -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json", **headers})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                raw = r.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            if e.code in (429, 503) and attempt < 4:
                time.sleep(2 ** attempt * 3)
                continue
            raise SystemExit(f"{method} {url.split('?')[0]} -> {e.code}: {e.read()[:300].decode(errors='replace')}")
    raise SystemExit("gave up after retries")


def title(name: str) -> str:
    return name.title() if name.isupper() else name


def documents() -> list[dict]:
    packets = {p["id"]: p for p in load_packets()}
    verdicts = load_decisions(packets)
    docs = []
    for pid, p in sorted(packets.items()):
        refs = p.get("refs") or []
        hospitals = sorted({r["hospital"] for r in refs if r.get("hospital")})
        if not hospitals:
            continue
        d = verdicts.get(pid, {})
        context = " ".join(p.get("context", "").split())
        sentence = " ".join(p["sentence"].split())
        text = sentence if len(sentence) > 900 else (sentence + " … " + context[: 900 - len(sentence)]).strip(" …")
        docs.append({
            "id": pid,
            "hospitals": hospitals,
            "hospitalName": title(refs[0].get("name", "")),
            "rule": p["rule"],
            "ruleTitle": p["ruleTitle"],
            "verdict": d.get("verdict", "unreviewed"),
            "explanation": (d.get("explanation") or "")[:400],
            "text": text,
            "url": refs[0].get("docUrl", ""),
        })
    return docs


def index_schema(name: str) -> dict:
    s = lambda n, **kw: {"name": n, "type": "Edm.String", "searchable": False, "filterable": False, "retrievable": True, **kw}
    return {
        "name": name,
        "fields": [
            s("id", key=True, filterable=True),
            {"name": "hospitals", "type": "Collection(Edm.String)", "filterable": True, "searchable": False, "retrievable": True},
            s("hospitalName", searchable=True),
            s("rule", filterable=True),
            s("ruleTitle", searchable=True),
            s("verdict", filterable=True),
            s("explanation", searchable=True),
            s("text", searchable=True),
            s("url"),
            {"name": "vector", "type": "Collection(Edm.Single)", "searchable": True, "retrievable": False,
             "dimensions": DIMS, "vectorSearchProfile": "v"},
        ],
        "vectorSearch": {"algorithms": [{"name": "hnsw", "kind": "hnsw"}], "profiles": [{"name": "v", "algorithm": "hnsw"}]},
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--env", type=Path, required=True, help="file with the Azure keys")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    docs = documents()
    print(f"{len(docs)} documents, {sum(len(d['text']) for d in docs) / 1e6:.2f} MB of text, "
          f"about {len(docs) * DIMS * 4 / 1e6:.1f} MB of vectors")
    if a.dry_run:
        print(json.dumps(docs[0], indent=1)[:800])
        return
    e = read_env(a.env)
    search, skey = e["AZURE_SEARCH_ENDPOINT"].rstrip("/"), e["AZURE_SEARCH_KEY"]
    index = e.get("AZURE_SEARCH_INDEX", "recount-policies")
    aoai, akey = e["AZURE_OPENAI_ENDPOINT"].rstrip("/"), e["AZURE_OPENAI_API_KEY"]
    dep = e.get("AZURE_OPENAI_EMBEDDING_DEPLOYMENT", "text-embedding-3-small")
    ver = e.get("AZURE_OPENAI_API_VERSION", "2024-10-21")

    call(f"{search}/indexes/{index}?api-version={SEARCH_API}", {"api-key": skey}, index_schema(index), "PUT")
    print("index ready:", index)
    for i in range(0, len(docs), 64):
        batch = docs[i: i + 64]
        emb = call(f"{aoai}/openai/deployments/{dep}/embeddings?api-version={ver}", {"api-key": akey},
                   {"input": [f"{d['ruleTitle']}. {d['hospitalName']}: {d['text']}" for d in batch]})
        for d, item in zip(batch, sorted(emb["data"], key=lambda x: x["index"])):
            d["vector"] = item["embedding"]
        up = call(f"{search}/indexes/{index}/docs/index?api-version={SEARCH_API}", {"api-key": skey},
                  {"value": [{"@search.action": "mergeOrUpload", **d} for d in batch]})
        bad = [r for r in up.get("value", []) if not r.get("status")]
        print(f"uploaded {i + len(batch)}/{len(docs)}" + (f", {len(bad)} failed" if bad else ""))
    stats = call(f"{search}/indexes/{index}/stats?api-version={SEARCH_API}", {"api-key": skey}, None, "GET")
    print("index stats:", stats)


if __name__ == "__main__":
    main()
