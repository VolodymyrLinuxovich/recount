# Independent re-implementation of price_audit's numbers, for cross-checking.
import csv,sys,json,ijson,statistics as st
M=sys.argv[1]
def n(x):
    if x is None: return None
    if isinstance(x,(int,float)): return float(x)
    x=str(x).strip()
    try: return float(x) if x else None
    except ValueError: return None
def summarize(items):
    both=eq=0; ins=[]; above=0; mnmx=0; outside=0
    for g,c,lo,hi,negs in items:
        if g is not None and c is not None:
            both+=1; eq+= abs(c-g)<=0.005
        if c and negs:
            ins.append(min(negs)/c*100); above+= c>max(negs)+0.005
        if lo is not None and hi is not None and lo>hi+0.005: mnmx+=1
        if negs and ((lo is not None and min(negs)<lo-0.005) or (hi is not None and max(negs)>hi+0.005)): outside+=1
    r=lambda v: round(v,1) if v is not None else None
    return dict(items=len(items),eqpct=r(eq/both*100) if both else None,paired=len(ins),
                lowest=r(st.median(ins)) if ins else None,above=r(above/len(ins)*100) if ins else None,minmax=mnmx,outside=outside)
def tall(p):
    f=open(p,newline='',encoding='utf-8-sig',errors='replace'); r=csv.reader(f); next(r);next(r)
    h=['|'.join(x.strip().lower() for x in c.split('|')) for c in next(r)]
    ident=[i for i,c in enumerate(h) if c in('description','setting','billing_class','modifiers','modifier','drug_unit_of_measurement','drug_type_of_measurement','standard_charge|gross','standard_charge|discounted_cash','standard_charge|min','standard_charge|max') or c.startswith('code|')]
    ix=lambda k: h.index(k)
    g,c,lo,hi,d=map(ix,['standard_charge|gross','standard_charge|discounted_cash','standard_charge|min','standard_charge|max','standard_charge|negotiated_dollar'])
    items={}
    for row in r:
        row=row+['']*(len(h)-len(row))
        k=tuple(row[i].strip() for i in ident)
        if k not in items: items[k]=[n(row[g]),n(row[c]),n(row[lo]),n(row[hi]),[]]
        v=n(row[d])
        if v is not None: items[k][4].append(v)
    return list(items.values())
def wide(p):
    f=open(p,newline='',encoding='utf-8-sig',errors='replace'); r=csv.reader(f); next(r);next(r)
    h=['|'.join(x.strip().lower() for x in c.split('|')) for c in next(r)]
    ds=[i for i,c in enumerate(h) if c.startswith('standard_charge|') and c.endswith('|negotiated_dollar') and c.count('|')==3]
    g,c,lo,hi=(h.index(k) for k in ['standard_charge|gross','standard_charge|discounted_cash','standard_charge|min','standard_charge|max'])
    out=[]
    for row in r:
        row=row+['']*(len(h)-len(row))
        out.append([n(row[g]),n(row[c]),n(row[lo]),n(row[hi]),[v for v in (n(row[i]) for i in ds) if v is not None]])
    return out
def js(p):
    f=open(p,'rb')
    if f.read(3)!=b'\xef\xbb\xbf': f.seek(0)
    out=[]
    for sci in ijson.items(f,'standard_charge_information.item',use_float=True):
        for sc in sci.get('standard_charges',[]):
            out.append([n(sc.get('gross_charge')),n(sc.get('discounted_cash')),n(sc.get('minimum')),n(sc.get('maximum')),
                        [v for v in (n(p.get('standard_charge_dollar')) for p in sc.get('payers_information') or []) if v is not None]])
    return out
for k,fn in [('zsfg',tall),('ucsf',js),('cpmc_vanness',tall),('stfrancis_hyde',js),('stmarys',js),('kaiser_sf',wide)]:
    print(k, json.dumps(summarize(fn(f'{M}/{k}.raw'))))
