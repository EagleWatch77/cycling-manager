#!/usr/bin/env python3
"""Builds ../TRAINING_SIMULATION.md and the PNG charts from results.json (written by
apps/web/src/lib/training/sim/run.cli.ts). Every number in the report comes from results.json.
  python3 docs/training-simulation/make_report.py"""
import json, os, sys
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, 'results.json'), encoding='utf8'))
SK = json.load(open(os.path.join(HERE, '../../apps/web/src/i18n/messages/sk.json'), encoding='utf8'))
S = {s['key']: s for s in D['summaries']}
N = D['meta']['n']; SEED = D['meta']['seed']
ATTR = D['attributes']
an = lambda k: SK.get('attr.' + k, k)
f2 = lambda x: f'{x:.2f}'; f1 = lambda x: f'{x:.1f}'; f0 = lambda x: f'{x:,.0f}'.replace(',', ' ')
MODEL = {'weekly': 'Týždenný (dnešný produkčný)', 'daily': 'Denný (návrh)', 'dailyGate': 'Denný + hranica 30/75'}
POL = {'none': 'Bez tréningu', 'light': 'Iba ľahký', 'normal': 'Iba normálny', 'hard': 'Iba tvrdý', 'rotate': 'Striedanie Ľ/N/T', 'smart': 'Rozumné plánovanie'}
CAL = {'noTour': 'bez Tour', 'tour': 'Tour (týždne 2, 5, 7)', 'tourLoad': 'Tour + hypotetická záťaž pretekov'}
def key(model, pol, cal, mapping='rescaled'): return f'{model}|{pol}|{cal}|{mapping}'
def table(head, rows, align=None):
    out = ['| ' + ' | '.join(head) + ' |', '|' + '|'.join((':---' if i == 0 else '---:') for i in range(len(head))) + '|']
    out += ['| ' + ' | '.join(str(c) for c in r) + ' |' for r in rows]
    return '\n'.join(out)
def img(name): return f'![{name}](training-simulation/{name}.png)'
plt.rcParams.update({'font.size': 9, 'axes.spines.top': False, 'axes.spines.right': False})
COL = {'weekly': '#6b7280', 'daily': '#d97706', 'dailyGate': '#0d9488'}

# ------------------------------------------------------------------ charts
bands = [f"{b['lo']}–{b['hi']}" for b in D['hiddenBands']]
fig, axs = plt.subplots(1, 4, figsize=(13, 3.2), sharey=True)
for ax, (k, t) in zip(axs, [('potential', 'Potenciál'), ('trainability', 'Trénovateľnosť'), ('professionalism', 'Profesionalita'), ('recovery', 'Regenerácia')]):
    ax.bar([i - 0.2 for i in range(6)], [b['share'] * 100 for b in D['hiddenBands']], 0.4, label='cieľ', color='#cbd5e1')
    ax.bar([i + 0.2 for i in range(6)], [s * 100 for s in D['hiddenStats'][k]['shares']], 0.4, label='simulácia', color='#0d9488')
    ax.set_title(t); ax.set_xticks(range(6)); ax.set_xticklabels(bands, rotation=45, fontsize=7)
axs[0].set_ylabel('% jazdcov'); axs[0].legend(fontsize=7)
plt.tight_layout(); plt.savefig(os.path.join(HERE, 'hidden_distribution.png'), dpi=130); plt.close()

pols = ['light', 'normal', 'hard', 'rotate', 'smart']
fig, axs = plt.subplots(1, 2, figsize=(12, 3.6), sharey=True)
for ax, cal in zip(axs, ['noTour', 'tour']):
    for mi, m in enumerate(['weekly', 'daily', 'dailyGate']):
        ax.bar([i + (mi - 1) * 0.27 for i in range(5)], [S[key(m, p, cal)]['focusGain3'] for p in pols], 0.27, label=MODEL[m], color=COL[m])
    ax.set_xticks(range(5)); ax.set_xticklabels([POL[p] for p in pols], fontsize=8); ax.set_title(f'Rast trénovaného atribútu po 3 sezónach — {CAL[cal]}')
axs[0].set_ylabel('priemerné body'); axs[0].legend(fontsize=7)
plt.tight_layout(); plt.savefig(os.path.join(HERE, 'growth_by_scenario.png'), dpi=130); plt.close()

fig, axs = plt.subplots(1, 2, figsize=(12, 3.6))
for pol, ls in [('light', ':'), ('normal', '--'), ('hard', '-'), ('smart', '-.')]:
    s = S[key('daily', pol, 'noTour')]
    axs[0].plot(range(1, 31), s['weekEndEnergy'], ls, label=f'denný — {POL[pol]}'); axs[1].plot(range(1, 31), s['weekEndFatigue'], ls, label=f'denný — {POL[pol]}')
for ax, k, t in [(axs[0], 'weekEndEnergy', 'Energia'), (axs[1], 'weekEndFatigue', 'Únava')]:
    ax.plot(range(1, 31), S[key('weekly', 'hard', 'noTour')][k], color='#6b7280', lw=2, label='týždenný produkčný — tvrdý')
    ax.set_title(f'Priemerná {t.lower()} na konci týždňa (bez Tour)'); ax.set_xlabel('týždeň (3 sezóny)'); ax.set_ylim(0, 100)
axs[0].legend(fontsize=7)
plt.tight_layout(); plt.savefig(os.path.join(HERE, 'condition_weekly.png'), dpi=130); plt.close()

fig, axs = plt.subplots(1, 2, figsize=(12, 3.4))
cases = [('weekly', 'hard'), ('daily', 'hard'), ('dailyGate', 'hard'), ('daily', 'smart'), ('dailyGate', 'smart')]
lab = [f'{MODEL[m].split(" (")[0]}\n{POL[p]}' for m, p in cases]
axs[0].bar(range(5), [S[key(m, p, 'noTour')]['exhaustedRiders'] for m, p in cases], color=[COL[m] for m, _ in cases]); axs[0].set_title('Vyčerpaní jazdci (energia ≤ 10 alebo únava ≥ 90 aspoň raz) z 10 000')
axs[1].bar(range(5), [S[key(m, p, 'noTour')]['sessionsSkipped'] for m, p in cases], color=[COL[m] for m, _ in cases]); axs[1].set_title('Vynechané jednotky (hranica 30/75), 3 sezóny')
for ax in axs: ax.set_xticks(range(5)); ax.set_xticklabels(lab, fontsize=7)
plt.tight_layout(); plt.savefig(os.path.join(HERE, 'exhaustion_skips.png'), dpi=130); plt.close()

fig, ax = plt.subplots(figsize=(7.5, 3.4))
segs = ['weak', 'average', 'exceptional']; SEGN = {'weak': 'slabí (spodných 20 %)', 'average': 'priemerní (40.–60. percentil)', 'exceptional': 'výnimoční (horný 1 %)'}
for mi, (m, p) in enumerate([('weekly', 'hard'), ('dailyGate', 'hard'), ('dailyGate', 'smart')]):
    ax.bar([i + (mi - 1) * 0.27 for i in range(3)], [S[key(m, p, 'noTour')]['segments'][sg]['focus3'] for sg in segs], 0.27, label=f'{MODEL[m].split(" (")[0]} — {POL[p]}', color=['#6b7280', '#d97706', '#0d9488'][mi])
ax.set_xticks(range(3)); ax.set_xticklabels([SEGN[x] for x in segs], fontsize=8); ax.set_ylabel('body trénovaného atribútu / 3 sezóny'); ax.legend(fontsize=7)
plt.tight_layout(); plt.savefig(os.path.join(HERE, 'segments.png'), dpi=130); plt.close()

fig, axs = plt.subplots(1, 3, figsize=(13, 3.4), sharey=True)
inf = D['influence']['weekly|hard|noTour|rescaled']
for ax, (k, t) in zip(axs, [('trainability', 'Trénovateľnosť'), ('professionalism', 'Profesionalita'), ('potential', 'Potenciál')]):
    ax.plot(bands, [r['focusGain3'] for r in inf[k]], 'o-', color='#6b7280', label='mapovanie 55–95 (dnešné vzorce)')
    ax.plot(bands, [r['focusGain3'] for r in D['influence']['dailyGate|hard|noTour|direct'][k]], 's--', color='#0d9488', label='priame 1–100')
    ax.set_title(t); ax.tick_params(axis='x', labelrotation=45, labelsize=7)
axs[0].set_ylabel('rast trénovaného atribútu / 3 sezóny'); axs[0].legend(fontsize=7)
plt.tight_layout(); plt.savefig(os.path.join(HERE, 'hidden_influence.png'), dpi=130); plt.close()

fig, ax = plt.subplots(figsize=(7, 3.3))
hl = D['highLevel']
ax.plot(bands, [r['focusGain3'] for r in hl['rescaled']['rows']], 'o-', color='#6b7280', label='mapovanie 55–95')
ax.plot(bands, [r['focusGain3'] for r in hl['direct']['rows']], 's--', color='#0d9488', label='priame 1–100')
ax.set_title('Vplyv potenciálu u silných jazdcov (výkonnostné atribúty +22)'); ax.set_ylabel('rast / 3 sezóny'); ax.legend(fontsize=7)
plt.tight_layout(); plt.savefig(os.path.join(HERE, 'potential_high_level.png'), dpi=130); plt.close()

# ------------------------------------------------------------------ tables
t_hidden = table(['Vlastnosť'] + [f"{b['lo']}–{b['hi']} ({b['share']*100:.0f} %)" for b in D['hiddenBands']] + ['priemer', 'medián', 'min–max'],
    [[{'potential': 'Potenciál', 'trainability': 'Trénovateľnosť', 'professionalism': 'Profesionalita', 'recovery': 'Regenerácia'}[k]] +
     [f"{f0(c)} ({sh*100:.2f} %)" for c, sh in zip(v['counts'], v['shares'])] + [f1(v['mean']), f0(v['median']), f"{v['min']}–{v['max']}"] for k, v in D['hiddenStats'].items()])
t_corr = table(['Dvojica', 'Pearsonovo r'], [[k.replace('~', ' ↔ '), f"{v:+.4f}"] for k, v in D['correlations'].items()])
t_combo = table(['Kombinácia', 'Počet jazdcov', 'Očakávaný počet (teória)'], [[c['name'], f0(c['count']), f"{c['expected']:.2f}"] for c in D['combos']])
def ovr_table(cal):
    rows = []
    for m in ['weekly', 'daily', 'dailyGate']:
        for p in ['none', 'light', 'normal', 'hard', 'rotate', 'smart']:
            s = S[key(m, p, cal)]; a, b = s['ovrGain1'], s['ovrGain3']
            rows.append([MODEL[m], POL[p], f2(a['mean']), f1(a['median']), f2(b['mean']), f1(b['median']), f1(b['p5']), f1(b['p25']), f1(b['p75']), f1(b['p95']), f1(b['p99']), f1(b['max'])])
    return table(['Model', 'Scenár', 'S1 priemer', 'S1 medián', 'S3 priemer', 'S3 medián', 'S3 p5', 'S3 p25', 'S3 p75', 'S3 p95', 'S3 p99', 'S3 max'], rows)
def focus_table(cal):
    rows = []
    for p in ['light', 'normal', 'hard', 'rotate', 'smart']:
        rows.append([POL[p]] + sum([[f1(S[key(m, p, cal)]['focusGain1']), f1(S[key(m, p, cal)]['focusGain3'])] for m in ['weekly', 'daily', 'dailyGate']], []) + [f1(S[key('weekly', p, cal)]['plannedWeeksPerRider'])])
    return table(['Scenár', 'Týž. S1', 'Týž. S3', 'Denný S1', 'Denný S3', 'Denný+hr. S1', 'Denný+hr. S3', 'Plánovaných týždňov / 3 sezóny'], rows)
def attr_table():
    a = [S[key('weekly', 'hard', 'noTour')], S[key('dailyGate', 'hard', 'noTour')], S[key('dailyGate', 'smart', 'tour')]]
    rows = [[an(k)] + sum([[f2(s['attrGain1'][i]), f2(s['attrGain3'][i])] for s in a], []) for i, k in enumerate(ATTR)]
    return table(['Atribút', 'Týž. tvrdý S1', 'S3', 'Denný+hr. tvrdý S1', 'S3', 'Denný+hr. rozumný + Tour S1', 'S3'], rows)
def cond_table():
    rows = []
    for p in ['light', 'normal', 'hard', 'rotate', 'smart']:
        row = [POL[p]]
        for m in ['weekly', 'daily', 'dailyGate']:
            s = S[key(m, p, 'noTour')]; row += [f1(s['trainWeekEnergy']), f1(s['trainWeekFatigue'])]
        rows.append(row)
    return table(['Scenár (bez Tour)', 'Týž. energia', 'Týž. únava', 'Denný energia', 'Denný únava', 'Denný+hr. energia', 'Denný+hr. únava'], rows)
def exh_table():
    rows = []
    for cal in ['noTour', 'tour', 'tourLoad']:
        for m in ['weekly', 'daily', 'dailyGate']:
            for p in ['light', 'normal', 'hard', 'rotate', 'smart']:
                k = key(m, p, cal)
                if k not in S: continue
                s = S[k]; rows.append([CAL[cal], MODEL[m], POL[p], f0(s['sessionsPlanned']), f0(s['sessionsSkipped']), f"{s['sessionsSkipped']/max(1,s['sessionsPlanned'])*100:.1f} %", f0(s['exhaustedRiders']), f0(s['exhaustedRiderDays'])])
    return table(['Kalendár', 'Model', 'Scenár', 'Plánované jednotky', 'Vynechané', 'Podiel', 'Vyčerpaní jazdci', 'Dni vyčerpania (jazdec-dni)'], rows)
def band_table():
    rows = []
    for m in ['weekly', 'daily', 'dailyGate']:
        for p in ['hard', 'smart']:
            b = S[key(m, p, 'noTour')]['readinessBands']; t = sum(b)
            rows.append([MODEL[m], POL[p]] + [f"{x/t*100:.1f} %" for x in b])
    return table(['Model', 'Scenár', 'Pripravenosť ≥ 80 (×1,00)', '60–79 (×0,95)', '40–59 (×0,85)', '20–39 (×0,70)', '< 20 (×0,50)'], rows)
def seg_table():
    rows = []
    for m in ['weekly', 'daily', 'dailyGate']:
        for p in ['light', 'normal', 'hard', 'smart']:
            s = S[key(m, p, 'noTour')]['segments']
            rows.append([MODEL[m], POL[p]] + sum([[f2(s[g]['s3']), f1(s[g]['focus3'])] for g in ['weak', 'average', 'exceptional']], []))
    return table(['Model', 'Scenár', 'Slabí OVR S3', 'atribút S3', 'Priemerní OVR S3', 'atribút S3', 'Výnimoční OVR S3', 'atribút S3'], rows)
def hardsmart_table():
    rows = []
    for cal in ['noTour', 'tour']:
        for m in ['weekly', 'daily', 'dailyGate']:
            h, s = S[key(m, 'hard', cal)], S[key(m, 'smart', cal)]
            rows.append([CAL[cal], MODEL[m], f1(h['focusGain3']), f1(s['focusGain3']), f"{(s['focusGain3']/h['focusGain3']-1)*100:+.1f} %", f"{h['trainWeekEnergy']:.0f} / {h['trainWeekFatigue']:.0f}", f"{s['trainWeekEnergy']:.0f} / {s['trainWeekFatigue']:.0f}", f0(h['exhaustedRiders']), f0(s['exhaustedRiders'])])
    return table(['Kalendár', 'Model', 'Tvrdý: atribút S3', 'Rozumný: atribút S3', 'Rozdiel', 'Tvrdý E / F', 'Rozumný E / F', 'Vyčerpaní (tvrdý)', 'Vyčerpaní (rozumný)'], rows)
def gate_table():
    rows = []
    for cal in ['noTour', 'tour', 'tourLoad']:
        for p in ['hard', 'smart']:
            if key('daily', p, cal) not in S: continue
            a, b = S[key('daily', p, cal)], S[key('dailyGate', p, cal)]
            rows.append([CAL[cal], POL[p], f2(a['focusGain3']), f2(b['focusGain3']), f"{(b['focusGain3']/a['focusGain3']-1)*100:+.1f} %", f"{a['trainWeekEnergy']:.0f} / {a['trainWeekFatigue']:.0f}", f"{b['trainWeekEnergy']:.0f} / {b['trainWeekFatigue']:.0f}", f0(a['exhaustedRiders']), f0(b['exhaustedRiders']), f0(b['sessionsSkipped'])])
    return table(['Kalendár', 'Scenár', 'Bez hranice: atribút S3', 'S hranicou: atribút S3', 'Zmena', 'Bez hr. E / F', 'S hr. E / F', 'Vyčerpaní bez', 'Vyčerpaní s', 'Vynechané jednotky'], rows)
def career_table():
    ks = ['weekly|none|tour|rescaled', 'weekly|hard|tour|rescaled', 'daily|hard|tour|rescaled', 'dailyGate|hard|tour|rescaled', 'dailyGate|smart|tour|rescaled']
    rows = []
    for i, c in enumerate(D['careers'], 1):
        h = c['hidden']
        rows.append([f"{i}. {c['title']}", f"#{c['id']}", c['age'], f"{h['potential']}/{h['trainability']}/{h['professionalism']}/{h['recovery']}", f"{c['energy']}/{c['fatigue']}", f"{an(c['focus'])} ({c['focusStart']})", f0(c['ovrStart'])] + [f"{c['outcomes'][k]['focusGain3']:+.0f} / {c['outcomes'][k]['ovrGain3']:+.0f}" for k in ks])
    return table(['Kariéra', 'ID', 'Vek', 'Pot/Trén/Prof/Reg', 'E/F na začiatku', 'Zameranie (hodnota)', 'OVR na začiatku', 'Bez tréningu', 'Týž. tvrdý', 'Denný tvrdý', 'Denný+hr. tvrdý', 'Denný+hr. rozumný'], rows)
def rookie_table():
    TH = [140, 145, 150, 155, 160]
    rows = []
    for k, nm in [('weekly|none|noTour|rescaled', 'Bez tréningu'), ('weekly|hard|noTour|rescaled', 'Týždenný tvrdý, bez Tour'), ('dailyGate|hard|noTour|rescaled', 'Denný+hr. tvrdý, bez Tour'), ('dailyGate|smart|noTour|rescaled', 'Denný+hr. rozumný, bez Tour'), ('dailyGate|smart|tour|rescaled', 'Denný+hr. rozumný, Tour')]:
        a = S[k]['ovrAbove']; rows.append([nm] + [f"{a['start'][i]} → {a['s1'][i]} → {a['s3'][i]}" for i in range(5)])
    t1 = table(['Scenár (počet jazdcov: štart → po S1 → po S3)'] + [f'OVR ≥ {t}' for t in TH], rows)
    r = S['weekly|hard|noTour|rescaled']['rookieLegacy']
    return t1, r
def influence_table(k, hk):
    rows = [[r['band'], f0(r['n']), f1(r['focusGain3']), f2(r['ovrGain3'])] for r in D['influence'][k][hk]]
    return table(['Pásmo', 'Jazdcov', 'Rast trénovaného atribútu S3', 'Rast OVR S3'], rows)
def age_table():
    rows = []
    for k, nm in [('weekly|hard|noTour|rescaled', 'Týždenný tvrdý'), ('dailyGate|smart|noTour|rescaled', 'Denný+hr. rozumný')]:
        for r in D['ageEffect'][k]: rows.append([nm, r['band'], f0(r['n']), f1(r['focusGain3']), f2(r['ovrGain3'])])
    return table(['Scenár', 'Vek na začiatku', 'Jazdcov', 'Rast atribútu S3', 'Rast OVR S3'], rows)
def mapping_table():
    rows = []
    for m, p in [('weekly', 'hard'), ('dailyGate', 'hard'), ('dailyGate', 'smart')]:
        a, b = S[key(m, p, 'noTour')], S[key(m, p, 'noTour', 'direct')] if key(m, p, 'noTour', 'direct') in S else None
        if b: rows.append([MODEL[m], POL[p], f1(a['focusGain3']), f1(b['focusGain3']), f2(a['ovrGain3']['mean']), f2(b['ovrGain3']['mean'])])
    return table(['Model', 'Scenár', 'Atribút S3 — mapovanie 55–95', 'priame 1–100', 'OVR S3 — mapovanie', 'priame'], rows)
def regen_table():
    rows = []
    for R in [1, 10, 25, 50, 75, 90, 100]:
        e, f = 8 + round(8 * R / 100 + 1e-9), 5 + round(6 * R / 100 + 1e-9)
        # JS Math.round = half up; python round = bankers -> use floor(x+0.5)
        import math
        e = 8 + math.floor(8 * R / 100 + 0.5); f = 5 + math.floor(6 * R / 100 + 0.5)
        et, ft = math.floor(e * 0.5 + 0.5), math.floor(f * 0.5 + 0.5)
        wk = lambda cost: 4 * e + 3 * et - 3 * cost  # hard: 4 free + 3 training days
        rows.append([R, e, f, et, ft, f"{4*e+3*et-72:+d}", f"{3*18-(4*f+3*ft):+d}", f"{5*e+2*et-36:+d}", f"{2*12-(5*f+2*ft):+d}"])
    return table(['R', 'Voľný deň: +energia', '−únava', 'Tréningový deň: +energia', '−únava', 'Týždeň TVRDÝ: Δ energia', 'Δ únava', 'Týždeň NORMÁLNY: Δ energia', 'Δ únava'], rows)

def load_table():
    rows = []
    for x in D['loadSensitivity']:
        rows.append([x['label'], 'denný' if x['model'] == 'daily' else 'denný + hranica', f2(x['focusGain3']), f"{x['trainWeekEnergy']:.0f} / {x['trainWeekFatigue']:.0f}", f0(x['exhaustedRiders']),
                     f"{x['skipped']/x['planned']*100:.1f} %" if x['model'] == 'dailyGate' else '—', ' / '.join(str(b['exhausted']) for b in x['exhaustedByRecovery'])])
    return table(['Záťaž tvrdej jednotky (energia / únava)', 'Model', 'Rast atribútu S3', 'E / F (koniec týždňa)', 'Vyčerpaní jazdci', 'Vynechané jednotky', 'Vyčerpaní podľa regenerácie 1–20 / 21–40 / 41–60 / 61–80 / 81–100'], rows)
t1, rk = rookie_table()
hs = lambda m, p, c='noTour': S[key(m, p, c)]
wh, dh, gh, gs, ds = hs('weekly', 'hard'), hs('daily', 'hard'), hs('dailyGate', 'hard'), hs('dailyGate', 'smart'), hs('daily', 'smart')
pot_inf = D['influence']['weekly|hard|noTour|rescaled']['potential']
tra_inf = D['influence']['weekly|hard|noTour|rescaled']['trainability']
pro_inf = D['influence']['weekly|hard|noTour|rescaled']['professionalism']
rec_inf = D['influence']['weekly|hard|noTour|rescaled']['recovery']
spread = lambda rows: (rows[-2]['focusGain3'] / rows[0]['focusGain3'] - 1) * 100
inv_total = sum(s['invalidValues'] for s in D['summaries'])
hl_r, hl_d = D['highLevel']['rescaled']['rows'], D['highLevel']['direct']['rows']
tmpl = open(os.path.join(HERE, 'TRAINING_SIMULATION.template.md'), encoding='utf8').read()
ctx = {k: v for k, v in globals().items() if k.isupper() or k.startswith(('t_', 't1')) or k in ('wh', 'dh', 'gh', 'gs', 'ds', 'rk', 'hl_r', 'hl_d', 'inv_total', 'f0', 'f1', 'f2', 'S', 'D', 'key', 'an')}
ctx.update(TEST_COUNT='36', load_t=load_table(), ovr_noTour=ovr_table('noTour'), ovr_tour=ovr_table('tour'), focus_noTour=focus_table('noTour'), focus_tour=focus_table('tour'), attr_t=attr_table(), cond_t=cond_table(),
    exh_t=exh_table(), band_t=band_table(), seg_t=seg_table(), hs_t=hardsmart_table(), gate_t=gate_table(), career_t=career_table(), rookie_t=t1, regen_t=regen_table(), map_t=mapping_table(), age_t=age_table(),
    inf_tr=influence_table('weekly|hard|noTour|rescaled', 'trainability'), inf_pr=influence_table('weekly|hard|noTour|rescaled', 'professionalism'),
    inf_po=influence_table('weekly|hard|noTour|rescaled', 'potential'), inf_re=influence_table('weekly|hard|noTour|rescaled', 'recovery'),
    inf_tr_d=influence_table('dailyGate|hard|noTour|direct', 'trainability'), inf_pr_d=influence_table('dailyGate|hard|noTour|direct', 'professionalism'), inf_po_d=influence_table('dailyGate|hard|noTour|direct', 'potential'),
    hl_t=table(['Potenciál', 'Jazdcov', 'Rast atribútu S3 — mapovanie 55–95', 'priame 1–100'], [[a['band'], f0(a['n']), f1(a['focusGain3']), f1(b['focusGain3'])] for a, b in zip(hl_r, hl_d)]),
    pot_spread=f"{spread(pot_inf):+.1f}", tra_spread=f"{spread(tra_inf):+.1f}", pro_spread=f"{spread(pro_inf):+.1f}", rec_spread=f"{spread(rec_inf):+.1f}",
    hl_gain=f"{(hl_r[-2]['focusGain3']/hl_r[0]['focusGain3']-1)*100:+.0f}", hl_gain_d=f"{(hl_d[-2]['focusGain3']/hl_d[0]['focusGain3']-1)*100:+.0f}", N=f0(N), SEED=SEED, elapsed=f"{D['meta']['elapsedMs']/1000:.0f}",
    start_ovr=f2(D['startMean']['ovr']), start_legacy=f1(D['startMean']['legacy']), runs=D['meta']['runs'], legacy_max_start=rk['maxStart'], legacy_max_s3=rk['maxS3'])
class SafeDict(dict):
    def __missing__(self, k): raise KeyError(k)
import re
def render(m):
    expr = m.group(1)
    g = dict(globals()); g.update(ctx)
    return str(eval(expr, g))
open(os.path.join(HERE, '..', 'TRAINING_SIMULATION.md'), 'w', encoding='utf8').write(re.sub(r'\{\{(.+?)\}\}', render, tmpl))
print('report written')
