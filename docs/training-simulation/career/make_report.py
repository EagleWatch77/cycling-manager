#!/usr/bin/env python3
"""Builds docs/TRAINING_CAREER_SIMULATION.md and PNG charts from results.json
(written by apps/web/src/lib/training/sim/career/career.cli.ts). Every number comes from results.json.
  python3 docs/training-simulation/career/make_report.py"""
import json, os
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, 'results.json'), encoding='utf8'))
SK = json.load(open(os.path.join(HERE, '../../../apps/web/src/i18n/messages/sk.json'), encoding='utf8'))
RUNS = D['runs']; META = D['meta']; N = META['n']; SEED = META['seed']
an = lambda k: SK.get('attr.' + k, k)
f0 = lambda x: f'{x:,.0f}'.replace(',', ' '); f1 = lambda x: f'{x:.1f}'; f2 = lambda x: f'{x:.2f}'; pc = lambda x: f'{x*100:.1f} %'
SN = {'specialist': 'Špecialista', 'allrounder': 'Všestranný', 'complex': 'Komplexný', 'racer': 'Pretekár', 'maxTraining': 'Maximálny tréning',
      'smart': 'Inteligentný manažér', 'noTrainRace': 'Bez tréningu, s pretekmi', 'noTrainNoRace': 'Bez tréningu a bez pretekov', 'oracle': 'Teoretická kontrola (úplná znalosť)'}
MAIN = ['specialist', 'allrounder', 'complex', 'racer', 'maxTraining', 'smart', 'noTrainRace', 'noTrainNoRace', 'oracle']
COLORS = {'specialist': '#0d9488', 'allrounder': '#2563eb', 'complex': '#7c3aed', 'racer': '#d97706', 'maxTraining': '#dc2626', 'smart': '#16a34a', 'noTrainRace': '#6b7280', 'noTrainNoRace': '#cbd5e1', 'oracle': '#111827'}
GROUPS = [('perf', 'Výkon'), ('tactics', 'Taktika'), ('technique', 'Technika'), ('experience', 'Skúsenosti')]
ATTRS = ['climbing', 'hills', 'flat', 'sprint', 'timeTrial', 'endurance', 'acceleration', 'positioning', 'attackTiming', 'reaction', 'energyManagement', 'breakawaySkill', 'descending', 'bikeHandling', 'cornering', 'packRiding', 'wetHandling', 'roughSurface', 'experience']
plt.rcParams.update({'font.size': 9, 'axes.spines.top': False, 'axes.spines.right': False})

def table(head, rows):
    out = ['| ' + ' | '.join(head) + ' |', '|' + '|'.join((':---' if i == 0 else '---:') for i in range(len(head))) + '|']
    return '\n'.join(out + ['| ' + ' | '.join(str(c) for c in r) + ' |' for r in rows])
def img(n, alt=''): return f'![{alt or n}](training-simulation/career/{n}.png)'
def R(i): return RUNS[i]
def snap(run, s): return next(x for x in run['snapshots'] if x['season'] == s)
def g12(i): return snap(R(i), 12)['growth']['mean']
def save(n): plt.tight_layout(); plt.savefig(os.path.join(HERE, n + '.png'), dpi=130); plt.close()
SEAS = [1, 3, 6, 9, 12]
mainid = lambda s: f'main:{s}'

# ================================================================== charts
fig, ax = plt.subplots(figsize=(9, 4.2))
for s in MAIN:
    ax.plot(range(13), R(mainid(s))['curveMean'], label=SN[s], color=COLORS[s], lw=2 if s in ('smart', 'maxTraining', 'specialist') else 1.2, ls='--' if s == 'oracle' else '-')
ax.set_xlabel('sezóna'); ax.set_ylabel('priemerný OVR'); ax.legend(fontsize=7, ncol=2); ax.set_title('Priemerný OVR počas 12 sezón (hlavný experiment, 4 Tour)')
save('ovr_curves')

fig, ax = plt.subplots(figsize=(9, 4))
for i, s in enumerate(MAIN):
    gr = snap(R(mainid(s)), 12)['growth']
    ax.plot([i, i], [gr['p5'], gr['p95']], color=COLORS[s], lw=2); ax.plot([i, i], [gr['p25'], gr['p75']], color=COLORS[s], lw=7); ax.plot(i, gr['median'], 'wo', ms=4)
ax.set_xticks(range(len(MAIN))); ax.set_xticklabels([SN[s].replace(' (', '\n(') for s in MAIN], rotation=30, ha='right', fontsize=7); ax.set_ylabel('rast OVR po 12 sezónach'); ax.set_title('Rast OVR po 12 sezónach: p5–p95 (tenká), p25–p75 (hrubá), medián (bod)')
save('ovr_growth_spread')

fig, ax = plt.subplots(figsize=(9, 4))
bottom = [0] * len(MAIN)
for gk, gl in GROUPS:
    vals = [snap(R(mainid(s)), 12)['groups'][gk]['gain'] for s in MAIN]
    ax.bar(range(len(MAIN)), vals, bottom=bottom, label=gl); bottom = [b + v for b, v in zip(bottom, vals)]
ax.set_xticks(range(len(MAIN))); ax.set_xticklabels([SN[s].replace(' (', '\n(') for s in MAIN], rotation=30, ha='right', fontsize=7); ax.set_ylabel('priemerný rast skupiny (body atribútu)'); ax.legend(fontsize=7); ax.set_title('Rast skupín atribútov po 12 sezónach')
save('group_gain')

fig, axs = plt.subplots(1, 3, figsize=(13, 3.6))
for ax, (title, f) in zip(axs, [('Vynechané tréningy / jazdec', lambda r: r['sessions']['skipped']), ('Vyčerpaní jazdci (%)', lambda r: r['exhaustedRiders'] / N * 100), ('Energia po 3. etape Tour', lambda r: r['tour']['postE'])]):
    ax.bar(range(len(MAIN) - 1), [f(R(mainid(s))) for s in MAIN[:-1]], color=[COLORS[s] for s in MAIN[:-1]]); ax.set_title(title)
    ax.set_xticks(range(len(MAIN) - 1)); ax.set_xticklabels([SN[s][:12] for s in MAIN[:-1]], rotation=45, ha='right', fontsize=6)
save('condition')

fig, axs = plt.subplots(1, 2, figsize=(11, 3.8))
for ax, (title, f) in zip(axs, [('Priemerný rast OVR po 12 sezónach', g12), ('Rast Výkonu (skupina) po 12 sezónach', lambda i: snap(R(i), 12)['groups']['perf']['gain'])]):
    ss = ['specialist', 'allrounder', 'complex', 'racer', 'maxTraining', 'smart', 'noTrainRace']
    ax.bar([i - 0.2 for i in range(len(ss))], [f(f'main:{s}') for s in ss], 0.4, label='4 Tour', color='#0d9488')
    ax.bar([i + 0.2 for i in range(len(ss))], [f(f't3:{s}') for s in ss], 0.4, label='3 Tour', color='#d97706')
    ax.set_xticks(range(len(ss))); ax.set_xticklabels([SN[s][:11] for s in ss], rotation=35, ha='right', fontsize=7); ax.set_title(title); ax.legend(fontsize=7)
save('tours_3_vs_4')

# controlled riders
CT = D['controlled']
def ctl(strategy, pm, mp='direct'): return next(c for c in CT if c['strategy'] == strategy and c['potentialModel'] == pm and c['mapping'] == mp)
def crider(c, label): return next(r for r in c['riders'] if r['label'] == label)
fig, axs = plt.subplots(2, 4, figsize=(15, 6), sharey='row')
for row, pm in enumerate(['existing', 'experimental']):
    c = ctl('specialist', pm)
    for col, (grp, title) in enumerate([('potential', 'Potenciál'), ('trainability', 'Trénovateľnosť'), ('recovery', 'Regenerácia'), ('professionalism', 'Profesionalita')]):
        ax = axs[row][col]
        for v, cl in zip([10, 50, 95], ['#dc2626', '#6b7280', '#16a34a']):
            r = crider(c, f'{grp} {v}'); ax.plot(range(13), r['perf'], label=str(v), color=cl)
        ax.set_title(f'{title} — {"existujúci vzorec" if pm == "existing" else "experimentálny potenciál"}', fontsize=8); ax.legend(fontsize=7, title='hodnota', title_fontsize=7)
        if col == 0: ax.set_ylabel('priemer 7 výkonnostných atribútov')
save('controlled_hidden')

fig, axs = plt.subplots(1, 2, figsize=(11, 3.8), sharey=True)
for ax, pm in zip(axs, ['existing', 'experimental']):
    c = ctl('specialist', pm)
    for lab, cl in [('A: potenciál 95, trénovateľnosť 50', '#2563eb'), ('B: potenciál 10, trénovateľnosť 95', '#dc2626')]:
        ax.plot(range(13), crider(c, lab)['perf'], label=lab, color=cl)
    ax.set_title('existujúci vzorec' if pm == 'existing' else 'experimentálny potenciál'); ax.legend(fontsize=7); ax.set_xlabel('sezóna')
axs[0].set_ylabel('priemer 7 výkonnostných atribútov')
save('cross_test')

rec = R(mainid('maxTraining'))['byHidden']['recovery']; rec_s = R(mainid('specialist'))['byHidden']['recovery']; rec_m = R(mainid('smart'))['byHidden']['recovery']
fig, axs = plt.subplots(1, 3, figsize=(13, 3.6))
bl = [b['band'] for b in rec]
for ax, (title, key, fmt) in zip(axs, [('Energia po 3. etape Tour', 'postE', 1), ('Únava po 3. etape Tour', 'postF', 1), ('Priemerná pripravenosť v etape (×)', 'stageREff', 1)]):
    ax.plot(bl, [b[key] for b in rec], 'o-', color='#dc2626', label='Maximálny tréning'); ax.plot(bl, [b[key] for b in rec_s], 'o-', color='#0d9488', label='Špecialista'); ax.plot(bl, [b[key] for b in rec_m], 'o-', color='#16a34a', label='Inteligentný')
    ax.set_title(title); ax.set_xlabel('pásmo regenerácie'); ax.tick_params(axis='x', labelsize=7)
axs[0].legend(fontsize=7)
save('recovery_tour')

fig, ax = plt.subplots(figsize=(8, 3.8))
for hk, cl in zip(['potential', 'trainability', 'professionalism', 'recovery'], ['#2563eb', '#dc2626', '#d97706', '#16a34a']):
    ax.plot([b['band'] for b in R(mainid('smart'))['byHidden'][hk]], [b['growth'] for b in R(mainid('smart'))['byHidden'][hk]], 'o-', label={'potential': 'Potenciál', 'trainability': 'Trénovateľnosť', 'professionalism': 'Profesionalita', 'recovery': 'Regenerácia'}[hk], color=cl)
ax.set_xlabel('pásmo skrytej vlastnosti'); ax.set_ylabel('rast OVR po 12 sezónach'); ax.legend(fontsize=7); ax.set_title('Rast OVR podľa pásma skrytej vlastnosti (Inteligentný manažér)')
save('hidden_bands_growth')

fig, ax = plt.subplots(figsize=(8, 3.8))
for a in D['aging']:
    ax.plot(range(13), a['perf'], label=('s poklesom' if a['decline'] else 'bez poklesu (produkcia)') + (' · tréning' if a['strategy'] == 'specialist' else ' · iba preteky'), ls='-' if a['decline'] else '--')
ax.set_xlabel('sezóna (vek 30 → 41)'); ax.set_ylabel('priemer 7 výkonnostných atribútov'); ax.legend(fontsize=7); ax.set_title('Starnutie: jazdec vo veku 30 pri štarte (experiment)')
save('aging')

# ================================================================== tables
def t_ovr(ids):
    rows = []
    for s in ids:
        r = R(mainid(s)) if not s.startswith(('t3:', 'bold:')) else R(s)
        rows.append([SN.get(s, s)] + [f"{f1(snap(r, x)['ovr']['mean'])} / {f1(snap(r, x)['ovr']['median'])} ({snap(r, x)['min']:.0f}–{snap(r, x)['max']:.0f})" for x in SEAS])
    return table(['Scenár'] + [f'S{x}: priemer / medián (min–max)' for x in SEAS], rows)
def t_growth_pct(season, ids=MAIN):
    rows = []
    for s in ids:
        g = snap(R(mainid(s)), season)['growth']
        rows.append([SN[s], f2(g['mean']), f1(g['p5']), f1(g['p25']), f1(g['median']), f1(g['p75']), f1(g['p90']), f1(g['p95']), f1(g['p99']), f1(g['max'])])
    return table(['Scenár', 'priemer', 'p5', 'p25', 'p50', 'p75', 'p90', 'p95', 'p99', 'max'], rows)
def t_ovr_pct(season, ids=MAIN):
    rows = []
    for s in ids:
        g = snap(R(mainid(s)), season)['ovr']
        rows.append([SN[s], f2(g['mean']), f1(g['p5']), f1(g['p25']), f1(g['median']), f1(g['p75']), f1(g['p90']), f1(g['p95']), f1(g['p99'])])
    return table(['Scenár', 'priemer', 'p5', 'p25', 'p50', 'p75', 'p90', 'p95', 'p99'], rows)
def t_groups(ids=MAIN):
    rows = []
    for s in ids:
        r = R(mainid(s))
        rows.append([SN[s]] + [' / '.join(f2(snap(r, x)['groups'][g]['gain']) for x in (1, 3, 6, 9, 12)) for g, _ in GROUPS])
    return table(['Scenár'] + [f'{n}: S1 / S3 / S6 / S9 / S12' for _, n in GROUPS], rows)
def t_attr(sid):
    r = R(mainid(sid)); rows = []
    for a in ATTRS:
        rows.append([an(a), f1(snap(r, 1)['attrs'][a]['mean'] - snap(r, 1)['attrs'][a]['gain'])] + [f2(snap(r, x)['attrs'][a]['gain']) for x in SEAS] + [f1(snap(r, 12)['attrs'][a]['mean'])])
    return table(['Atribút', 'štart'] + [f'+S{x}' for x in SEAS] + ['priemer S12'], rows)
def t_sessions(ids=MAIN):
    rows = []
    for s in ids:
        r = R(mainid(s)); x = r['sessions']
        rows.append([SN[s], f1(x['plannedWeeks']), f1(x['planned']), f1(x['done']), f1(x['skipped']), pc(x['skippedShare']) if x['planned'] else '–', f0(r['exhaustedRiders']), pc(r['exhaustedRiders'] / N), f2(r['exhaustedDaysMean'])])
    return table(['Scenár', 'plánované týždne / jazdec', 'jednotky plánované', 'vykonané', 'vynechané', 'podiel vynechaných', 'vyčerpaní jazdci', '% jazdcov', 'dní vyčerpania / jazdec'], rows)
def t_tour(ids=MAIN):
    rows = []
    for s in ids:
        t = R(mainid(s))['tour']
        if t['count'] == 0: rows.append([SN[s]] + ['–'] * 8); continue
        rows.append([SN[s], f1(t['preE']), f1(t['preF']), f1(t['postE']), f1(t['postF']), f1(t['weekEndE']), f1(t['weekEndF']), f1(t['nextWeekScore']), f"{t['stageREff']:.3f}"])
    return table(['Scenár', 'energia pred Tour', 'únava pred Tour', 'energia po 3. etape', 'únava po 3. etape', 'energia na konci týždňa', 'únava na konci týždňa', 'pripravenosť na začiatku ďalšieho týždňa', 'priem. účinnosť pripravenosti v etape'], rows)
def t_form(ids=MAIN):
    rows = []
    for s in ids:
        r = R(mainid(s)); t = r['tour']
        rows.append([SN[s], f1(t['form']), f1(t['fitness']), f1(t['morale']), f1(r['finalForm']), f1(r['finalFitness']), f1(r['finalMorale'])])
    return table(['Scenár', 'forma pri štarte Tour', 'kondícia pri štarte Tour', 'morálka pri štarte Tour', 'forma (koniec)', 'kondícia (koniec)', 'morálka (koniec)'], rows)
def t_hidden_bands(rid, hk):
    return table(['Pásmo', 'jazdcov', 'rast OVR S12', 'vynechané tréningy', 'vyčerpaní %', 'dní vyčerpania', 'účinnosť v etape', 'energia po Tour', 'únava po Tour'],
                 [[b['band'], f0(b['n']), f2(b['growth']), f2(b['skipped']), pc(b['exhaustedShare']), f2(b['exhaustedDays']), f"{b['stageREff']:.3f}", f1(b['postE']), f1(b['postF'])] for b in R(rid)['byHidden'][hk]])
def t_reg(rids):
    rows = []
    for rid, lab in rids:
        reg = R(rid)['regression']
        for kk, kl in [('growth', 'rast OVR S12'), ('skipped', 'vynechané tréningy'), ('exhaustedDays', 'dni vyčerpania'), ('stageREff', 'účinnosť v etape')]:
            x = reg[kk]
            rows.append([lab, kl, f2(x['r2'] * 100) + ' %'] + [f"{x['drop'][h] * 100:.2f} %" for h in ('potential', 'trainability', 'professionalism', 'recovery')])
    return table(['Scenár', 'výsledok', 'R² (4 vlastnosti)', 'unikátny podiel: potenciál', 'trénovateľnosť', 'profesionalita', 'regenerácia'], rows)
def t_age(rid):
    r = R(rid)
    a = table(['Vek na štarte', 'jazdcov', 'rast OVR S12'], [[x['age'], f0(x['n']), f2(x['growth'])] for x in r['byAgeStart']])
    b = table(['Vek v sezóne', 'jazdec-sezón', 'rast OVR / sezóna', 'rast Výkonu / sezóna'], [[x['age'], f0(x['n']), f2(x['ovrGain']), f2(x['perfGain'])] for x in r['ageSeason']])
    return a, b
def t_compare(pairs, labels):
    rows = []
    for (rid, lab) in pairs:
        r = R(rid); s12 = snap(r, 12)
        rows.append([lab, f2(s12['growth']['mean']), f2(s12['growth']['median']), f2(s12['groups']['perf']['gain']), f2(s12['groups']['tactics']['gain']), f2(s12['groups']['technique']['gain']), f2(s12['groups']['experience']['gain']), f1(r['sessions']['done']), f1(r['sessions']['skipped']), f0(r['exhaustedRiders']), f"{r['tour']['stageREff']:.3f}", f1(r['tour']['postE'])])
    return table(labels, rows)
CMP_HEAD = ['Scenár', 'rast OVR (priemer)', 'medián', 'Výkon', 'Taktika', 'Technika', 'Skúsenosti', 'jednotky / jazdec', 'vynechané', 'vyčerpaní', 'účinnosť v etape', 'energia po Tour']
def t_ctl(strategy, pm, mp='direct'):
    c = ctl(strategy, pm, mp); rows = []
    for r in c['riders']:
        rows.append([r['label'], f1(r['perf'][12] - r['perf'][0]), f'{r["ovr"][12] - r["ovr"][0]:.0f}', f1(r['perf'][3] - r['perf'][0]), f1(r['perf'][6] - r['perf'][0]), f0(r['sessionsDone']), f0(r['skipped']), f0(r['exhaustedDays']), f'{r["stageREff"]:.3f}', f1(r['postE']), f1(r['postF'])])
    return table(['Jazdec (ostatné skryté = 50)', 'rast Výkonu S12', 'rast OVR S12', 'Výkon S3', 'Výkon S6', 'jednotky', 'vynechané', 'dni vyčerpania', 'účinnosť v etape', 'energia po Tour', 'únava po Tour'], rows)
def t_cross():
    rows = []
    for pm, lab in [('existing', 'existujúci vzorec'), ('experimental', 'experimentálny potenciál')]:
        c = ctl('specialist', pm); a = crider(c, 'A: potenciál 95, trénovateľnosť 50'); b = crider(c, 'B: potenciál 10, trénovateľnosť 95')
        cross = next((s for s in range(1, 13) if a['perf'][s] > b['perf'][s]), None)
        rows.append([lab] + [f"{f1(a['perf'][s])} / {f1(b['perf'][s])}" for s in (1, 3, 6, 9, 12)] + [f'sezóna {cross}' if cross else 'nepredbehne za 12 sezón'])
    return table(['Model', 'A / B po S1', 'S3', 'S6', 'S9', 'S12', 'A predbehne B'], rows)
def t_load():
    rows = []
    for s in ['maxTraining', 'smart']:
        for l, lab in [('h24', '−24 / +18'), ('h22', '−22 / +16'), ('h20', '−20 / +15')]:
            for gt, glab in [(True, 'hranica'), (False, 'bez hranice')]:
                rid = (f'main:{s}' if l == 'h22' and gt else f'nogate:{s}' if l == 'h22' else f'load:{s}:{l}' + ('' if gt else ':nogate'))
                r = R(rid); s12 = snap(r, 12)
                rows.append([SN[s], lab, glab, f2(s12['growth']['mean']), f2(s12['groups']['perf']['gain']), f1(r['sessions']['done']), f1(r['sessions']['skipped']), f0(r['exhaustedRiders']), pc(r['exhaustedRiders'] / N), f2(r['exhaustedDaysMean']), f"{r['tour']['stageREff']:.3f}", f1(r['tour']['postE'])])
    return table(['Stratégia', 'Tvrdá jednotka (energia / únava)', 'hranica 30/75', 'rast OVR', 'rast Výkonu', 'vykonané', 'vynechané', 'vyčerpaní', '%', 'dní vyčerpania', 'účinnosť v etape', 'energia po Tour'], rows)

# ================================================================== numbers for the narrative
P = lambda s: R(mainid(s)); g = lambda s: g12(mainid(s))
perf = lambda rid: snap(R(rid), 12)['groups']['perf']['gain']
reg_s = R(mainid('smart'))['regression']['growth']
dist = D['hiddenDist']
start_ovr = META['startOvrMean']
nt, nr = P('noTrainNoRace'), P('noTrainRace')
race_only = g('noTrainRace')
best_main = max(['specialist', 'allrounder', 'complex', 'racer', 'maxTraining', 'smart'], key=g)
exp_pot = {s: g12(f'pot:{s}') for s in ['specialist', 'allrounder', 'complex', 'smart', 'maxTraining']}
bold_gain = {s: g12(f'bold:{s}') for s in ['allrounder', 'complex', 'smart', 'noTrainRace']}
t3 = {s: g12(f't3:{s}') for s in ['specialist', 'allrounder', 'complex', 'racer', 'maxTraining', 'smart', 'noTrainRace']}
c_exist = ctl('specialist', 'existing'); c_exp = ctl('specialist', 'experimental')
def span(c, grp):
    v = {x: crider(c, f'{grp} {x}')['perf'][12] - crider(c, f'{grp} {x}')['perf'][0] for x in (10, 50, 95)}
    return v
def sp(c, grp):
    v = span(c, grp); return f"{f1(v[10])} / {f1(v[50])} / {f1(v[95])}"
cross_e = next((s for s in range(1, 13) if crider(c_exist, 'A: potenciál 95, trénovateľnosť 50')['perf'][s] > crider(c_exist, 'B: potenciál 10, trénovateľnosť 95')['perf'][s]), None)
cross_x = next((s for s in range(1, 13) if crider(c_exp, 'A: potenciál 95, trénovateľnosť 50')['perf'][s] > crider(c_exp, 'B: potenciál 10, trénovateľnosť 95')['perf'][s]), None)
PERF12 = {s: snap(P(s), 12)['groups']['perf']['gain'] for s in MAIN}


import re
PARAMS_TS = open(os.path.join(HERE, '../../../apps/web/src/lib/training/sim/career/params.ts'), encoding='utf8').read()
def block(name):
    m = re.search(r'(export const ' + name + r'[\s\S]*?\n\};?)\n', PARAMS_TS)
    return m.group(1) if m else name
def stages_table():
    rows = []
    for w, lst in D['stages'].items():
        for st in lst:
            rows.append([w, st['tourId'], st['number'], st['name'], st['km'], {'flat': 'rovina', 'hilly': 'kopce', 'mountain': 'hory', 'tt': 'časovka'}[st['kind']], 'áno' if st['rough'] else '', f"{st['load']['energy']} / {st['load']['fatigue']}", f"{st['load06']['energy']} / {st['load06']['fatigue']}"])
    return table(['Týždeň', 'Tour', 'Etapa', 'Názov', 'km', 'Typ', 'Hrubý povrch', 'Záťaž (energia / únava), mierka 1,0', 'mierka 0,6 (citlivosť)'], rows)
def hidden_table():
    names = {'potential': 'Potenciál', 'trainability': 'Trénovateľnosť', 'professionalism': 'Profesionalita', 'recovery': 'Regenerácia'}
    rows = []
    for h in D['hiddenDist']:
        rows.append([names[h['key']]] + [f"{c} ({c / N * 100:.1f} %)" for c in h['counts']] + [f1(h['mean'])])
    return table(['Vlastnosť', '1–20 (10 %)', '21–40 (25 %)', '41–60 (40 %)', '61–80 (20 %)', '81–95 (4 %)', '96–100 (1 %)', 'priemer'], rows)
def careers_md():
    out = []
    names = {'specialist': 'Špecialista', 'allrounder': 'Všestranný', 'complex': 'Komplexný', 'racer': 'Pretekár', 'maxTraining': 'Maximálny', 'smart': 'Inteligentný', 'noTrainRace': 'Bez tréningu+preteky', 'noTrainNoRace': 'Bez všetkého', 'oracle': 'Teoretická kontrola'}
    for n, c in enumerate(D['careers'], 1):
        h = c['hidden']; o = c['ovrBySeason']
        out.append(f"#### {n}. {c['label']}\n")
        out.append(f"Jazdec č. {c['id']} · vek na štarte {c['startAge']} · skryté vlastnosti: potenciál **{h['potential']}**, trénovateľnosť **{h['trainability']}**, profesionalita **{h['professionalism']}**, regenerácia **{h['recovery']}** · stratégia „Inteligentný manažér“ (vykonané / vynechané jednotky: {c['smartSessions']['done']} / {c['smartSessions']['skipped']}).\n")
        out.append(f"OVR: štart **{o[0]:.0f}** → S1 {o[1]:.0f} → S3 {o[3]:.0f} → S6 {o[6]:.0f} → S9 {o[9]:.0f} → **S12 {o[12]:.0f}** (rast {o[12] - o[0]:+.0f}).\n")
        out.append('| Skupina | štart → po 12 sezónach |\n|:---|:---|')
        for gname, keys in [('Výkon', ATTRS[:7]), ('Taktika', ATTRS[7:12]), ('Technika', ATTRS[12:18]), ('Skúsenosti', ATTRS[18:])]:
            out.append(f"| {gname} | " + ', '.join(f"{an(k)} {c['start'][k]:.0f}→{c['final'][k]:.0f}" for k in keys) + ' |')
        out.append('')
        out.append('Výsledný OVR po 12 sezónach podľa stratégie (rovnaký jazdec): ' + ', '.join(f"{names[k]} {v:.0f}" for k, v in c['ovr12ByStrategy'].items()) + f". Maximálny tréning: {c['maxExhaustedDays']} dní vyčerpania.\n")
    return '\n'.join(out)

# ================================================================== numbers for the narrative (second part)
sm, sp_, mx, cx = P('smart'), P('specialist'), P('maxTraining'), P('complex')
tr_bands = R(mainid('smart'))['byHidden']['trainability']
reg_sp = R(mainid('specialist'))['regression']; reg_mx = R(mainid('maxTraining'))['regression']
low_rec_mx = R(mainid('maxTraining'))['byHidden']['recovery']; low_rec_sm = R(mainid('smart'))['byHidden']['recovery']
potrel = {s: g12(f'potrel:{s}') for s in ['specialist', 'complex', 'smart', 'maxTraining']}
potrel_perf = {s: perf(f'potrel:{s}') for s in ['specialist', 'complex', 'smart', 'maxTraining']}
c_rel = ctl('specialist', 'experimentalRel')
def hl(c, lab, i=12): r = crider(c, lab); return r['perf'][i] - r['perf'][0]
cross_r = next((s_ for s_ in range(1, 13) if crider(c_rel, 'A: potenciál 95, trénovateľnosť 50')['perf'][s_] > crider(c_rel, 'B: potenciál 10, trénovateľnosť 95')['perf'][s_]), None)
facG = {s: g12(f'fac:{s}') - g(s) for s in ['specialist', 'complex', 'smart']}
mapG = {s: g12(f'map:{s}') - g(s) for s in ['specialist', 'complex', 'smart', 'maxTraining']}
def fmt_cross(x): return f'sezóna {x}' if x else 'nepredbehne za 12 sezón'
ageSeason = {x['age']: x for x in R(mainid('smart'))['ageSeason']}

def write_report():
    L = []
    A = L.append
    A(f"""# Kariérna simulácia 10 000 jazdcov — 12 sezón (EXPERIMENT)

> **Stav:** výhradne experimentálna simulácia. Nič nie je nasadené ani schválené. Produkčná databáza, tréningové vzorce, OVR, UI ani existujúce schopnosti jazdcov sa nemenili. Všetky nové mechanizmy, vzorce a koeficienty sú označené **EXP** a budeme ich schvaľovať až po vyhodnotení. Prvá simulácia ([TRAINING_SIMULATION.md](TRAINING_SIMULATION.md)) ostáva nezmenená na porovnanie.
> Súbor generuje `docs/training-simulation/career/make_report.py` z `results.json` — každé číslo pochádza z jedného behu (seed **{SEED}**, **{f0(N)}** unikátnych jazdcov, {META['runs']} populačných scenárov, výpočet {META['elapsedSec']:.0f} s).

## 0. Zhrnutie

* **Rast OVR je v 12 sezónach veľmi pomalý.** Priemerný jazdec začína na OVR {f1(start_ovr)} a po 12 sezónach má podľa stratégie len +{f1(g('noTrainRace'))} (iba preteky) až +{f1(g(best_main))} ({SN[best_main]}). Medián rastu je {f0(snap(sm,12)['growth']['median'])}–{f0(snap(mx,12)['growth']['median'])} bodov, 99. percentil {f1(snap(sm,12)['growth']['p99'])}–{f1(snap(mx,12)['growth']['p99'])}, najlepší jazdec zo všetkých scenárov +{f0(max(snap(R(mainid(s)),12)['growth']['max'] for s in MAIN))}. Trénovaný výkonnostný atribút narastie za 12 sezón o ~{f0(PERF12['specialist']*7)} bodov (priemer 7 atribútov +{f2(PERF12['specialist'])}). OVR je priemer 19 atribútov, hráč trénuje naraz jeden.
* **Tréning vs. preteky.** Samotné preteky (4 Tour) dajú +{f1(g('noTrainRace'))} OVR (Taktika +{f1(snap(P('noTrainRace'),12)['groups']['tactics']['gain'])}, Technika +{f1(snap(P('noTrainRace'),12)['groups']['technique']['gain'])}, Skúsenosti +{f1(snap(P('noTrainRace'),12)['groups']['experience']['gain'])}), Výkon sa pretekmi nemení. Tréning pridá ďalších {f1(g('specialist')-g('noTrainRace'))} (Špecialista) až {f1(g('maxTraining')-g('noTrainRace'))} (Maximálny tréning) bodu OVR.
* **Tvrdý tréning (−22/+16) s hranicou 30/75 vyčerpá {pc(mx['exhaustedRiders']/N)} jazdcov** a {pc(mx['tour']['tiredShare'])} etáp odjazdia unavení (priem. účinnosť pripravenosti {mx['tour']['stageREff']:.2f}), no rastie len o {f2(g('maxTraining')-g('specialist'))} OVR viac než Špecialista na normálnej intenzite. **Inteligentný manažér nemá žiadneho vyčerpaného jazdca a žiadnu vynechanú jednotku**, ale rastie o {f2(g('maxTraining')-g('smart'))} OVR menej než maximálny tréning (Výkon +{f2(PERF12['smart'])} vs. +{f2(PERF12['maxTraining'])}).
* **Regenerácia sa v Tour naozaj prejaví**, hlavne pri agresívnom plánovaní: pri maximálnom tréningu má jazdec s regeneráciou 1–20 po 3. etape energiu {f1(low_rec_mx[0]['postE'])} a pripravenosť v etape ×{low_rec_mx[0]['stageREff']:.2f}, jazdec 96–100 energiu {f1(low_rec_mx[5]['postE'])} a ×{low_rec_mx[5]['stageREff']:.2f}. Inteligentný manažér rozdiely takmer vyrovná (×{low_rec_sm[0]['stageREff']:.3f} vs. ×{low_rec_sm[5]['stageREff']:.3f}).
* **Potenciál sa v dnešnom vzorci neprejaví vôbec** (rast jazdca s potenciálom 10, 50 a 95 je rovnaký: {sp(c_exist,'potential')} bodov Výkonu za 12 sezón), lebo jeho účinok sa zapína až od celkového výkonu 140 a pri dnešnom tempe sa tam nikto nedostane. Jediný dôležitý skrytý atribút je trénovateľnosť (unikátne vysvetľuje {f1(reg_s['drop']['trainability']*100)} % rozptylu rastu, potenciál {f2(reg_s['drop']['potential']*100)} %, profesionalita {f2(reg_s['drop']['professionalism']*100)} %, regenerácia {f2(reg_s['drop']['recovery']*100)} %).
* **4 Tour vs. 3 Tour:** so štyrmi Tour rastie Taktika, Technika a Skúsenosti o ~{f0((snap(P('specialist'),12)['groups']['tactics']['gain']/snap(R('t3:specialist'),12)['groups']['tactics']['gain']-1)*100)} % viac, ale Výkon o ~{f0((1-PERF12['specialist']/perf('t3:specialist'))*100)} % menej (5 vs. 6 tréningových týždňov). OVR je pri štyroch Tour o {f2(g('specialist')-g12('t3:specialist'))} (Špecialista) až {f2(g('noTrainRace')-g12('t3:noTrainRace'))} (iba preteky) vyššie.
* **Najcitlivejší neoverený predpoklad je záťaž pretekov:** pri mierke 0,6 namiesto 1,0 klesne počet vyčerpaných pri maximálnom tréningu z {f0(mx['exhaustedRiders'])} na {f0(R('race06:maxTraining')['exhaustedRiders'])} a energia po Tour stúpne zo {f0(mx['tour']['postE'])} na {f0(R('race06:maxTraining')['tour']['postE'])}. Engine zatiaľ neposkytuje záťaž (energia/únava) ani výsledky pre webovú hru, takže ide o hypotézu.

Odporúčania v skratke sú v §7, vrátane odpovedí na šesť otázok zo zadania.

---

## 1. Audit: čo už existuje a čo chýba

Prečítané: `lib/rider/config.ts`, `lib/rider/score.ts`, `lib/training/*`, `lib/facilities/config.ts`, `data/tours.ts`, `data/tourSchedule.ts`, `lib/leagues.ts`, `packages/race-engine/src/*`, `TRAINING_SIMULATION.md`.

### 1.1 Atribúty (19, presné kľúče v kóde)

| Skupina | Atribúty (kľúč → názov v hre) | Rozsah |
|:---|:---|:---|
| Výkon (7) | climbing Stúpanie, hills Kopce, flat Rovina, sprint Šprint, timeTrial Časovka, endurance Vytrvalosť, acceleration Akcelerácia | štart 100–160, kariérny strop **200** |
| Taktika (5) | positioning Pozícia, attackTiming Načasovanie útoku, reaction Reakcia, energyManagement Manažment energie, breakawaySkill Schopnosť úniku | 100–**160** |
| Technika (6) | descending Zjazd, bikeHandling Ovládanie bicykla, cornering Zákruty, packRiding Jazda v balíku, wetHandling Jazda v daždi, roughSurface Nerovný povrch | 100–**160** |
| Skúsenosti (1) | experience | 100–**160** |

OVR = `overallRating()` = 0,50 · priemer Výkon + 0,25 · priemer Taktika + 0,20 · priemer Technika + 0,05 · Skúsenosti (zaokrúhlené). Jeden bod atribútu preto znamená: Výkon 0,071 · Taktika 0,050 · Technika 0,033 · Skúsenosti 0,050 OVR.

### 1.2 Mechanizmy rastu

| Skupina | V produkcii | Chýba (návrh v tejto simulácii, EXP) |
|:---|:---|:---|
| Výkon | **Existuje.** Týždenný plán (1 / 2 / 3 jednotky), `BASE_TRAINING 3 × jednotky × trénovateľnosť × profesionalita × vek × zázemie × pripravenosť × developmentRoomFactor`, sekundárny atribút 35 %, akumulátor prah 12 so zvyškom. | Nič — použité bez prepisovania (importované funkcie, parita testovaná). Potenciál: experimentálne varianty (§2.4). |
| Technika | **Existuje len tréningom.** Technický plán (1 jednotka, `TECHNICAL_BASE 2.0 × trénovateľnosť × profesionalita × vek × pripravenosť`, max **+1 bod** na plán, prah 12). Preteky Techniku nemenia. | Rast z pretekov podľa charakteru etapy (§2.2). |
| Taktika | **Neexistuje** (komentár v kóde: „bude rásť cez systém situácií v pretekoch“). | Rast z pretekov, relevantnosť podľa etapy (§2.2). |
| Skúsenosti | **Neexistuje.** | +progres za každú odjazdenú etapu (§2.2). |
| Starnutie | Existuje **iba spomalenie rastu** (vekový faktor 1,30 → 0,30). **Pokles schopností neexistuje** (potvrdené v `facilities/config.ts`: „No decline system of any kind exists“). | Pokles je testovaný samostatne (§5.17), nie ako pravidlo. |
| Stav jazdca | Energia, únava (denný model z 1. simulácie je tiež iba návrh), forma 50 / kondícia 60 / morálka 70 sa nemenia. | Jednoduchý experimentálny model formy, kondície a morálky (§2.5) — nezasahuje do rastu. |

### 1.3 Race-engine

`packages/race-engine` je čisto tickový model jednej etapy (energia za km `BASE_ROAD_ENERGY_PER_KM = 0.2125`, drafting, útoky, rozpad skupín). Zistenia: **(a)** nemá integráciu do webu ani do ukladania stavu jazdca; **(b)** nepočíta únavu, formu, morálku ani pripravenosť (len energiu v etape); **(c)** terénové násobiteľe energie sú špecifikované len pre zjazd (0,35), ostatné 1,0; **(d)** `breakawaySkill` a `wetHandling` v ňom ešte neexistujú; **(e)** web nemá dáta, ktoré by umožnili etapu spoľahlivo odsimulovať (výsledky etáp, zloženie pelotónu, počasie). **Preto sú pretekové výsledky nesimulované** a použil som oddelený experimentálny model záťaže a rastu, odvodený od konštanty enginu (§2.1). Žiadne výsledky pretekov ani poradia sa nepočítajú.

### 1.4 Kalendár

`data/tourSchedule.ts`: Tour v týždňoch 2 (Highlands), 5 (Danube alebo Coastal), 7 (Northern Crown), 9 (Silver Horizon); Rookie vidí a jazdí **3 etapy** na Tour; hráč si smie vybrať max. 3 Tour za sezónu. Nová 4. Tour je **iba simulačný predpoklad**: v hlavnom experimente sa jazdia týždne 2, 5, 7 a 9 (nekoliduje s existujúcim kalendárom — týždeň 9 je v ňom už Tour). Etapy majú len typ obtiažnosti (flat/hilly/mountain) a dĺžku; časovky sú rozpoznané podľa názvu (*Koruna severu* 44 km, *Časovka Obzor* 28 km), *Kamenné cesty* sú hrubý povrch (EXP označenie).

---

## 2. Experimentálne mechanizmy (všetko EXP)

### 2.1 Pretekárska záťaž etapy
Etapy sa jazdia v **utorok, streda, štvrtok** týždňa Tour (EXP; kalendár zatiaľ nemá dátumy etáp), 3 etapy, žiadny tréning, ostatné dni plná regenerácia. Záťaž etapy z konštanty enginu: `energia = km × 0,2125 × drafting 0,80 × typ(rovina 1,0 / kopce 1,10 / hory 1,25 / časovka 1,10, bez draftingu)`, `únava = 0,75 × energia` (rovnaký pomer ako tvrdý tréning 18/24). Po etape 50 % dennej regenerácie ako pri tréningu. Päť pretekových dní z predchádzajúceho experimentu sa **nepoužíva**.

{stages_table()}

### 2.2 Rast z pretekov (EXP)
Každá odjazdená etapa pridá surový progres do **rovnakých akumulátorov s prahom 12** ako tréning; atribúty sa neprepisujú automaticky všetky — progres dostane len schopnosť, ktorú etapa využíva (váha 0 = nič). Vzorce:

* Taktika/Technika: `progres = koeficient × váha(typ etapy) × veľkosť etapy × pripravenosť(účinnosť) × trénovateľnosť × vekový faktor × priestor`
* Skúsenosti: `progres = koeficient × veľkosť etapy × priestor` (bez skrytých vlastností a veku — skúsenosť získa každý odjazdením)
* `veľkosť etapy = km/150` v rozsahu 0,3–1,2 (časovka 0,6), `priestor = clamp((160 − hodnota)/30, 0, 1)`
* *Jazda v daždi* dostane progres iba v daždivej etape (20 % etáp, rovnaké počasie pre všetkých jazdcov, seed), *Nerovný povrch* iba v etape s hrubým povrchom.
* Výkon sa pretekmi **nemení** (výkon rastie predovšetkým tréningom).

| Variant | Taktika koef. | Technika koef. | Skúsenosti koef. | Strop za sezónu: Taktika / Technika / Skúsenosti (bodov na atribút) |
|:---|---:|---:|---:|:---|
| Konzervatívny | {RACE['conservative']['tactics']} | {RACE['conservative']['technique']} | {RACE['conservative']['experience']} | {RACE['conservative']['capTactics']} / {RACE['conservative']['capTechnique']} / {RACE['conservative']['capExperience']} |
| Výraznejší | {RACE['bold']['tactics']} | {RACE['bold']['technique']} | {RACE['bold']['experience']} | {RACE['bold']['capTactics']} / {RACE['bold']['capTechnique']} / {RACE['bold']['capExperience']} |

Prah akumulátora **12** (rovnaký ako tréning), tvrdé stropy: 160 pre Taktiku/Techniku/Skúsenosti, 200 pre Výkon (produkcia).

Váhy etáp (zdroj: `params.ts`, poradie atribútov Taktika: Pozícia, Načasovanie útoku, Reakcia, Manažment energie, Schopnosť úniku; Technika: Zjazd, Ovládanie bicykla, Zákruty, Jazda v balíku, [dážď], [hrubý povrch]):

```ts
{block('TACT_W')}

{block('TECH_W')}
```

**Zabránenie dvojitému započítaniu:** (1) tréning a preteky sa nikdy neodohrajú v tom istom týždni (Tour týždeň nemá plán); (2) každá etapa pripíše každý atribút najviac raz; (3) preteky a technický tréning zdieľajú jeden akumulátor na atribút a **spoločný sezónny strop** (Technika: konzervatívne max +{RACE['conservative']['capTechnique']}, výraznejšie +{RACE['bold']['capTechnique']} bodov na atribút za sezónu), technický plán má navyše produkčný strop +1 na plán; (4) rast sa nikdy nevracia do energie/únavy (test).

### 2.3 Denný tréning a regenerácia
Podľa zadania: Ľahký 1 jednotka (−12 / +8), Normálny 2 jednotky (−18 / +12 za jednotku), Tvrdý 3 jednotky v troch variantoch (−24/+18, −22/+16, −20/+15); technická jednotka = produkčných 5 / 5. Dni: Ľahký utorok, Normálny utorok+štvrtok, Tvrdý utorok+štvrtok+sobota. Regenerácia `energia 8 + round(8R/100)`, `únava 5 + round(6R/100)`, voľný deň 100 %, tréningový/pretekový deň 50 % po záťaži. Hranica: energia < 30 alebo únava > 75 pred jednotkou → vynechá sa, bez progresu a záťaže, plná regenerácia. Týždenné faktory (atribúty, vek, potenciál, trénovateľnosť, profesionalita) sa zmrazia na začiatku týždňa — rozdelenie na jednotky **nezvyšuje** rast (test z 1. simulácie platí). Hlavný scenár: hranica **zapnutá**, tvrdá jednotka **−22/+16** (stred porovnávaných variantov); ostatné varianty sú v §5.8.

### 2.4 Potenciál (EXP)
**Produkcia:** potenciál vstupuje cez `overallPotentialFactor` (váha 0 pod celkovým výkonom 140). Pri priamej škále 1–100 sa navyše hodnota v `potentialEase` orezáva na 55–95, takže všetko ≤ 55 sa správa ako 55 a ≥ 95 ako 95.
**Experimentálny model A (absolútny strop):** osobný mäkký strop celkového výkonu `C = {META['experimentalParams']['potential']['base']} + {META['experimentalParams']['potential']['slope']} × potenciál` ({', '.join(f'p={a}: {b:g}' for a, b in META['experimentalParams']['potential']['ceilings'])}); rast sa spomaľuje lineárne na posledných {META['experimentalParams']['potential'].get('span', 25)} bodoch pred stropom (`faktor = clamp((C − celkový výkon)/25, 0,05, 1)`). Nahrádza produkčný faktor potenciálu (nie je to ďalší násobiteľ) a nahrádza miesto `overallPotentialFactor`; lokálna obtiažnosť atribútu ostáva.
**Experimentálny model B (relatívny priestor):** `C = štartový celkový výkon jazdca + {META['experimentalParams']['potential']['rel']['base']} + {META['experimentalParams']['potential']['rel']['slope']} × potenciál` — potenciál určuje, koľko môže jazdec od svojho štartu ešte vyrásť (p=10: +{META['experimentalParams']['potential']['rel']['base'] + 10 * META['experimentalParams']['potential']['rel']['slope']:g} bodov, p=50: +{META['experimentalParams']['potential']['rel']['base'] + 50 * META['experimentalParams']['potential']['rel']['slope']:g}, p=95: +{META['experimentalParams']['potential']['rel']['base'] + 95 * META['experimentalParams']['potential']['rel']['slope']:g}).
V oboch modeloch platí: ďaleko pod stropom rastú všetci rovnako, spomalenie sa objaví až pri priblížení k osobnému stropu.

### 2.5 Forma, kondícia, morálka (EXP, nezasahujú do rastu)
`kondícia`: +0,8 za tréningovú jednotku, +1,0 za etapu, −0,15 denne (štart 60, 0–100); `forma` sa denne približuje o 25 % k `0,5 × pripravenosť + 0,5 × kondícia` (štart 50); `morálka` (štart 70): etapa s účinnosťou ≥ 0,85 +0,5, ≥ 0,70 −0,5, > 0,50 −1,0, inak −2,0, vynechaná jednotka −0,5, dokončená Tour +2, denný návrat k 70 o 3 %. Slúžia ako zobrazené výstupy; produkcia ich dnes nemení.

### 2.6 Starnutie
Produkcia: iba vekový faktor rastu. Experiment pádu (iba samostatný test, **nie** návrh pravidla): od veku 31 klesá každý výkonnostný atribút o 1 / sezónu (31–33), 2 (34–36), 3 (37+), minimum 100.

### 2.7 Hypotetický odhad pretekového výkonu
Etapový index = priemer relevantných výkonnostných atribútov etapy × účinnosť pripravenosti (tabuľka produkcie ×1,00 … ×0,50). **Nie sú to výsledky pretekov.** Sleduje sa hlavne priemerná účinnosť pripravenosti v etape a podiel etáp odjazdených pri účinnosti ≤ 0,70.

---

## 3. Populácia

{f0(N)} unikátnych jazdcov, seed {SEED}. Vek na štarte 18–22 (rovnomerne: {', '.join(f'{a}: {c}' for a, c in zip(range(18, 23), META['ages']))}), všetci oddýchnutí (energia 100, únava 0); verejné atribúty ako v 1. simulácii (základ 130 ± 12, tri silné +10, tri slabé −10, šum ±3, rozsah 100–160, priemerný štartový OVR **{f1(start_ovr)}**). Skryté vlastnosti nezávisle na priamej škále 1–100 v pásmach 10/25/40/20/4/1 %, rovnomerne v pásme. **Hlavný scenár mapovanie 1–100 → 55–95 nepoužíva** (hodnoty idú do vzorcov priamo); mapovaná variácia je len kontrola (§5.14). Rovnaká populácia vo všetkých scenároch.

{hidden_table()}

---

## 4. Kariérne stratégie — presný algoritmus

Plán týždňa N sa vyberá na **začiatku týždňa N−1** a po výbere je nemenný (test). Týždeň 1 je bez plánu; plán na týždeň 2 sa robí v týždni 1; v Tour týždni sa neplánuje; plán na týždeň 10 sa robí v týždni 9; v týždni 10 sa neplánuje na ďalšiu sezónu. Stratégie dostávajú iba **verejný pohľad** (verejné atribúty, viditeľná energia/únava, kalendár, vek, pozorovaná rýchlosť regenerácie) — nikdy skryté vlastnosti (test: zdrojový kód plánovačov ich neobsahuje). Pozorovaný odhad regenerácie `R̂ = ((denný prírastok energie − 8)/8) × 100` z posledného voľného dňa.

| # | Stratégia | Algoritmus plánu na nasledujúci týždeň |
|:---|:---|:---|
| 1 | Špecialista | Výkonnostný plán, intenzita **normálna**, vždy ten istý atribút = najvyšší výkonnostný atribút na začiatku kariéry. |
| 2 | Všestranný | Výkonnostný plán, **normálna**, atribút = aktuálne najnižší zo 7 výkonnostných. |
| 3 | Komplexný | Cyklus 3 týždňov: 2× výkonnostný plán (najnižší výkonnostný atribút, normálna), 1× technický plán (najnižší technický atribút). Taktiku a Skúsenosti získava pretekmi. |
| 4 | Pretekár | Tour má prednosť: týždeň pred Tour **oddych (bez plánu)**, týždeň po Tour a dva týždne pred ďalšou Tour **ľahký**, inak normálny (najnižší výkonnostný atribút). |
| 5 | Maximálny tréning | Špecialista, ale **tvrdá** intenzita v každom trénovateľnom týždni. |
| 6 | Inteligentný manažér | Odhadne stav na začiatku plánovaného týždňa (zostávajúci priebeh aktuálneho týždňa s jeho potvrdeným plánom/Tour, odhad R̂, pravidlo hranice) → skóre pripravenosti ≥ 75 tvrdý, ≥ 55 normálny, ≥ 35 ľahký, inak oddych; vek ≥ 29 maximálne normálny; týždeň pred Tour maximálne ľahký; ľahký týždeň nahradí technickým plánom (len 5/5 záťaže), ak je technika slabšia než výkon; fokus = najnižší výkonnostný atribút. |
| 7 | Kontrola: bez tréningu, s pretekmi | Žiadny plán, jazdí sa všetko. |
| 8 | Kontrola: bez tréningu, bez pretekov | Žiadny plán, žiadne etapy (iba starnutie). |
| T | Teoretická kontrola (nehrateľná) | Pozná presnú regeneráciu a presný stav; z ľahkého/normálneho/tvrdého plánu vyberie najvyšší dvojtýždňový progres bez vyčerpania. Slúži iba ako strop ukazujúci, koľko stojí neznalosť skrytých vlastností. |

---

## 5. Výsledky

### 5.1 OVR po 1., 3., 6., 9. a 12. sezóne (hlavný experiment, 4 Tour)
Bunka: priemer / medián (min–max).

{t_ovr(MAIN)}

{img('ovr_curves')}

**Percentily OVR po 12 sezónach (štart priemer {f1(start_ovr)}):**

{t_ovr_pct(12)}

**Percentily rastu OVR (OVR − štartový OVR):**

Po 1. sezóne:

{t_growth_pct(1)}

Po 3. sezónach:

{t_growth_pct(3)}

Po 6. sezónach:

{t_growth_pct(6)}

Po 9. sezónach:

{t_growth_pct(9)}

Po 12. sezónach:

{t_growth_pct(12)}

{img('ovr_growth_spread')}

### 5.2 Rast skupín atribútov
Priemerný rast skupiny v bodoch atribútu: S1 / S3 / S6 / S9 / S12.

{t_groups()}

{img('group_gain')}

Detailný vývoj všetkých 19 atribútov pre každý scenár je v **Prílohe A**.

### 5.3 Odohrané a vynechané tréningy, vyčerpanie

{t_sessions()}

„Vyčerpaný“ = aspoň raz v dennom kroku energia ≤ 10 alebo únava ≥ 90.

{img('condition')}

### 5.4 Energia, únava a pripravenosť pred Tour a po Tour (priemer za všetkých 48 Tour)

{t_tour()}

Forma, kondícia a morálka (EXP, nezasahujú do rastu):

{t_form()}

### 5.5 Skryté vlastnosti a rozdelenie kariér

Rast OVR po 12 sezónach podľa pásma skrytej vlastnosti — **Inteligentný manažér**:

""")
    for hk, name in [('potential', 'Potenciál'), ('trainability', 'Trénovateľnosť'), ('professionalism', 'Profesionalita'), ('recovery', 'Regenerácia')]:
        A(f"**{name}**\n\n{t_hidden_bands(mainid('smart'), hk)}\n")
    A(img('hidden_bands_growth'))
    A("\nRovnako pre **Maximálny tréning** (kde sa regenerácia prejaví):\n")
    A(f"**Regenerácia**\n\n{t_hidden_bands(mainid('maxTraining'), 'recovery')}\n")
    A("**Špecialista (normálny tréning):**\n")
    A(f"**Regenerácia**\n\n{t_hidden_bands(mainid('specialist'), 'recovery')}\n")
    A(f"""Rozklad rozptylu výsledkov na štyri skryté vlastnosti (lineárna regresia, „unikátny podiel“ = pokles R² po vyradení vlastnosti):

{t_reg([(mainid('smart'), 'Inteligentný'), (mainid('specialist'), 'Špecialista'), (mainid('maxTraining'), 'Maximálny')])}

**Zistenie:** rast OVR určuje takmer výlučne trénovateľnosť (r²≈{f0(reg_s['r2']*100)} %, z toho {f0(reg_s['drop']['trainability']*100)} % jej unikátny podiel). Potenciál, profesionalita aj regenerácia vysvetľujú pri rovnakom plánovaní {f1((reg_s['drop']['potential']+reg_s['drop']['professionalism']+reg_s['drop']['recovery'])*100)} % spolu. Regenerácia je rozhodujúca pri **záťaži** (účinnosť v etape: unikátne {f0(reg_mx['stageREff']['drop']['recovery']*100)} % pri maximálnom tréningu, {f0(reg_s['drop']['recovery']*100)} % rastu pri Inteligentnom) a pri výskyte vyčerpania.

### 5.6 Vplyv veku
Rast OVR podľa veku na štarte (Inteligentný manažér) a podľa veku v sezóne:

""")
    a, b = t_age(mainid('smart'))
    A(a + '\n\n' + b + '\n')
    A(f"""Vekový faktor produkcie (1,30 pre ≤ 19, 1,20 pre 20–22, 1,10 pre 23–25, 1,00 pre 26–28, 0,80 pre 29–31, 0,55 pre 32–34) sa prejaví: rast Výkonu za sezónu klesá od {f2(ageSeason[min(ageSeason)]['perfGain'])} (vek {min(ageSeason)}) na {f2(ageSeason[max(ageSeason)]['perfGain'])} (vek {max(ageSeason)}). Keďže jazdci štartujú 18–22 a simulácia končí vo veku 29–33, jazdec neprejde do veku, v ktorom by starnutie bolo kritické; pokles schopností v populácii (§5.17) preto zasiahne len posledné 1–3 sezóny.

### 5.7 Tri vs. štyri Tour za sezónu

{t_compare([(mainid(s), SN[s] + ' — 4 Tour') for s in ['specialist', 'complex', 'smart', 'maxTraining', 'noTrainRace']] + [('t3:' + s, SN[s] + ' — 3 Tour') for s in ['specialist', 'complex', 'smart', 'maxTraining', 'noTrainRace']], CMP_HEAD)}

{img('tours_3_vs_4')}

Štyri Tour = 48 Tour a 144 etáp za 12 sezón, päť tréningových týždňov za sezónu (60 za kariéru); tri Tour = 36 Tour, 108 etáp, šesť tréningových týždňov (72). Rozdiel v počte vykonaných jednotiek: Špecialista {f0(R('t3:specialist')['sessions']['done'])} vs. {f0(sp_['sessions']['done'])}.

### 5.8 Tri varianty tvrdej tréningovej záťaže (Maximálny tréning a Inteligentný manažér)

{t_load()}

### 5.9 Existujúci vs. experimentálny potenciál (populácia)

{t_compare([(mainid('specialist'), 'Špecialista — existujúci'), ('pot:specialist', 'Špecialista — model A (absolútny strop)'), ('potrel:specialist', 'Špecialista — model B (relatívny priestor)'), (mainid('complex'), 'Komplexný — existujúci'), ('pot:complex', 'Komplexný — model A'), ('potrel:complex', 'Komplexný — model B'), (mainid('smart'), 'Inteligentný — existujúci'), ('pot:smart', 'Inteligentný — model A'), ('potrel:smart', 'Inteligentný — model B'), (mainid('maxTraining'), 'Maximálny — existujúci'), ('pot:maxTraining', 'Maximálny — model A'), ('potrel:maxTraining', 'Maximálny — model B')], CMP_HEAD)}

### 5.10 Kontrolované porovnania identických jazdcov
Verejné atribúty všetky 130, vek 20, ostatné tri skryté vlastnosti 50, hlavný experiment (4 Tour, hranica, −22/+16), Špecialista (normálny tréning), priama škála 1–100.

**Existujúci vzorec:**

{t_ctl('specialist', 'existing')}

**Experimentálny potenciál A:**

{t_ctl('specialist', 'experimental')}

**Experimentálny potenciál B:**

{t_ctl('specialist', 'experimentalRel')}

**Maximálny tréning (tvrdý), existujúci vzorec — tu sa prejaví regenerácia:**

{t_ctl('maxTraining', 'existing')}

{img('controlled_hidden')}

**Môže jazdec s vysokým potenciálom a priemernou trénovateľnosťou (A) predbehnúť rýchlo sa učiaceho jazdca s nízkym potenciálom (B)?** Priemer 7 výkonnostných atribútov (A / B):

{t_cross()}

Model B (relatívny priestor): A predbehne B {fmt_cross(cross_r)} (A: +{f1(hl(c_rel, 'A: potenciál 95, trénovateľnosť 50'))}, B: +{f1(hl(c_rel, 'B: potenciál 10, trénovateľnosť 95'))} za 12 sezón).

{img('cross_test')}

### 5.11 Regenerácia a viacdňové Tour
Rozdelenie podľa pásma regenerácie pri **Maximálnom tréningu**, **Špecialistovi** a **Inteligentnom manažérovi** je v tabuľkách §5.5. Kontrolný jazdec s hranicou **vypnutou** (maximálny tréning, ostatné vlastnosti 50):

{table(['Regenerácia', 'OVR po 12 sezónach (štart 130)', 'dní vyčerpania', 'energia po 3. etape', 'únava po 3. etape', 'účinnosť v etape', 'etáp odjazdených unavený'], [[x['recovery'], f0(x['ovr12']), f0(x['exhaustedDays']), f1(x['postE']), f1(x['postF']), f"{x['stageREff']:.2f}", pc(x['tired'])] for x in D['recNoGate']])}

{img('recovery_tour')}

### 5.12 Konzervatívny vs. výraznejší rast Taktiky, Techniky a Skúsenosti

{t_compare([(mainid('noTrainRace'), 'Iba preteky — konzervatívny'), ('bold:noTrainRace', 'Iba preteky — výraznejší'), (mainid('allrounder'), 'Všestranný — konzervatívny'), ('bold:allrounder', 'Všestranný — výraznejší'), (mainid('complex'), 'Komplexný — konzervatívny'), ('bold:complex', 'Komplexný — výraznejší'), (mainid('smart'), 'Inteligentný — konzervatívny'), ('bold:smart', 'Inteligentný — výraznejší')], CMP_HEAD)}

Priemerný rast za sezónu pri iba pretekoch: Taktika {f2(snap(P('noTrainRace'),12)['groups']['tactics']['gain']/12)} / {f2(snap(R('bold:noTrainRace'),12)['groups']['tactics']['gain']/12)} (konzerv. / výraz.), Technika {f2(snap(P('noTrainRace'),12)['groups']['technique']['gain']/12)} / {f2(snap(R('bold:noTrainRace'),12)['groups']['technique']['gain']/12)}, Skúsenosti {f2(snap(P('noTrainRace'),12)['groups']['experience']['gain']/12)} / {f2(snap(R('bold:noTrainRace'),12)['groups']['experience']['gain']/12)} bodu na atribút.

### 5.13 Zázemie (Tréningové a Regeneračné centrum, úroveň 5) — citlivostná analýza
Rookie liga má strop zázemia úroveň 1, takže ide o investíciu vyšších líg. Vplyv: Tréningové centrum ×1,03–1,15 podľa veku (iba Výkon), Regeneračné centrum ×1,20 na dennú regeneráciu.

{t_compare([(mainid('specialist'), 'Špecialista — bez zázemia'), ('fac:specialist', 'Špecialista — zázemie L5'), (mainid('complex'), 'Komplexný — bez zázemia'), ('fac:complex', 'Komplexný — zázemie L5'), (mainid('smart'), 'Inteligentný — bez zázemia'), ('fac:smart', 'Inteligentný — zázemie L5')], CMP_HEAD)}

Zázemie pridá {f2(facG['specialist'])} (Špecialista), {f2(facG['complex'])} (Komplexný) a {f2(facG['smart'])} (Inteligentný) OVR a zníži počet vyčerpaných jazdcov Špecialistu z {f0(sp_['exhaustedRiders'])} na {f0(R('fac:specialist')['exhaustedRiders'])} — zázemie hlavne kompenzuje nízku vrodenú regeneráciu, rast zvyšuje menej.

### 5.14 Citlivosť: mapovanie skrytých hodnôt (kontrola oproti dnešnému systému)
Hlavný scenár používa priamu škálu 1–100. Mapovaný variant (1→55, 100→95) zodpovedá dnešnej kalibrácii vzorcov:

{t_compare([(mainid('specialist'), 'Špecialista — priama škála 1–100'), ('map:specialist', 'Špecialista — mapované 55–95'), (mainid('complex'), 'Komplexný — priama'), ('map:complex', 'Komplexný — mapované'), (mainid('smart'), 'Inteligentný — priama'), ('map:smart', 'Inteligentný — mapované'), (mainid('maxTraining'), 'Maximálny — priama'), ('map:maxTraining', 'Maximálny — mapované')], CMP_HEAD)}

Priama škála spomalí priemerný rast OVR o {f2(mapG['specialist'])}–{f2(mapG['maxTraining'])} bodu (Špecialista … Maximálny) a rast Výkonu Špecialistu o {f0((1-perf(mainid('specialist'))/perf('map:specialist'))*100)} %. Dôvod: priemerná trénovateľnosť na škále 1–100 je {f0(TRMEAN)} (faktor učenia `0,5 + t/200` = {TRF_D:.2f}), po mapovaní na 55–95 je {f0(TRMAP)} (faktor {TRF_M:.2f}). Zároveň sú rozdiely medzi jazdcami pri priamej škále väčšie (trénovateľnosť 1 dáva faktor 0,505, 100 dáva 1,0; pri mapovaní 0,78–0,97).

### 5.15 Citlivosť: záťaž etapy (mierka 0,6 namiesto 1,0)

{t_compare([(mainid('complex'), 'Komplexný — mierka 1,0'), ('race06:complex', 'Komplexný — mierka 0,6'), (mainid('smart'), 'Inteligentný — mierka 1,0'), ('race06:smart', 'Inteligentný — mierka 0,6'), (mainid('maxTraining'), 'Maximálny — mierka 1,0'), ('race06:maxTraining', 'Maximálny — mierka 0,6')], CMP_HEAD)}

### 5.16 Rozdiel medzi tvrdým tréningom a plánovaním (zhrnutie)
Maximálny tréning vykoná {f0(mx['sessions']['done'])} jednotiek (+ {f1(mx['sessions']['skipped'])} vynechaných), Špecialista {f0(sp_['sessions']['done'])}, Inteligentný {f0(sm['sessions']['done'])}. Rozdiel rastu Výkonu: Maximálny +{f2(PERF12['maxTraining'])}, Špecialista +{f2(PERF12['specialist'])}, Inteligentný +{f2(PERF12['smart'])}, Teoretická kontrola +{f2(PERF12['oracle'])} (pri {f0(P('oracle')['exhaustedRiders'])} vyčerpaných jazdcoch).

### 5.17 Starnutie — samostatný test poklesu
Jazdec starý 30 rokov, všetky atribúty 150, ostatné skryté 50, 12 sezón (vek 30 → 41):

{table(['Scenár', 'priemer výkonu po 12 sezónach', 'OVR po 12 sezónach'], [[('s poklesom (EXP)' if a['decline'] else 'bez poklesu (produkcia)') + (' · špecialista' if a['strategy'] == 'specialist' else ' · iba preteky'), f1(a['perf'][-1]), f0(a['ovr'][-1])] for a in D['aging']])}

{img('aging')}

V populácii (štart 18–22, koniec 29–33) test poklesu: Inteligentný {f2(g12('decline:smart'))} vs. {f2(g('smart'))} OVR bez poklesu (rozdiel {f2(g12('decline:smart') - g('smart'))}).

### 5.18 Dvadsať konkrétnych kariér
Výber podľa pevných pravidiel v `career.cli.ts` (každé pravidlo je v názve), z populácie pri seede {SEED}. „Štart → po 12 sezónach“ sú verejné atribúty pri stratégii *Inteligentný manažér*; OVR podľa stratégie sú pre toho istého jazdca.

{careers_md()}

---

## 6. Technické kontroly

`npx tsx --tsconfig tsconfig.json src/lib/training/sim/career/career.test.ts` — **{TEST_COUNT} kontrol**, všetky prechádzajú. Overujú: reprodukovateľnosť (rovnaký seed → bitovo rovnaké kariéry); hranice atribútov (Výkon 100–200, ostatné ≤ 160, celé čísla); neklesajúce atribúty bez experimentu poklesu; zákaz tréningu v Tour týždni; nemennosť plánov (vykonaný plán = plán rozhodnutý o týždeň skôr); týždeň 1 bez plánu a žiadny plán na ďalšiu sezónu; počet trénovateľných týždňov (5 / 6) vrátane týždňa 10; 48 Tour a 144 etáp; starnutie (vek +1 za sezónu, pokles presne od 31. roku); nemennosť vrodených skrytých vlastností (zmrazený vstup, kontrolný súčet); sezónne stropy rastu z pretekov a technického tréningu; rast nevracia nič do energie/únavy; žiadne neplatné hodnoty pre 10 000 jazdcov × 12 sezón; parita s produkčným `calculatePerformanceRawGrowth()` a `overallRating()`; konštanta enginu zrkadlená z balíka; hranica 30/75; plánovače nepoužívajú skryté vlastnosti (statická kontrola kódu); potenciál modely A/B (monotónnosť, žiadny plošný násobiteľ).

---

## 7. Odporúčania
""")
    A(RECO)
    A(f"""
---

## 8. Reprodukcia a obmedzenia

```
cd apps/web
npx --no-install tsx --tsconfig tsconfig.json src/lib/training/sim/career/career.cli.ts {SEED} {N}
npx --no-install tsx --tsconfig tsconfig.json src/lib/training/sim/career/career.test.ts
cd ../.. && python3 docs/training-simulation/career/make_report.py
```

Obmedzenia: žiadne výsledky pretekov (engine nie je integrovaný); záťaž etapy, forma/kondícia/morálka a všetky koeficienty rastu z pretekov sú EXP; zameranie tréningu určuje stratégia (reálny hráč môže meniť); chýba zranenie, cena zázemia, kontrakty, prestupy, ligy; Rookie OVR limity nie sú implementované (pozri 1. simuláciu — nepasujú na stupnicu `overallRating()`); všetci jazdci jazdia všetky etapy všetkých Tour; hráči-ľudia sa nesimulujú ako náhodní — stratégie sú deterministické; kalendár dní etáp (Ut–Št) je predpoklad.

---

## Príloha A — vývoj všetkých 19 atribútov (priemerný prírastok oproti štartu, body)
""")
    for sid in MAIN[:-1]:
        A(f"\n### {SN[sid]}\n\n{t_attr(sid)}\n")
    return '\n'.join(L)

RACE = META['experimentalParams']['raceGrowth']
sg = lambda x: f'{x:+.2f}'
TRMEAN = next(h['mean'] for h in D['hiddenDist'] if h['key'] == 'trainability')
TRMAP = 55 + (TRMEAN - 1) * 40 / 99
TRF_D = 0.5 + TRMEAN / 200
TRF_M = 0.5 + TRMAP / 200
TEST_COUNT = '131'

RECO = f"""
Všetko nižšie je **odporúčanie na rozhodnutie**, nič nebolo zmenené. Čísla sú z tejto simulácie, preto platia pri predpokladoch z §2 (hlavne záťaž etapy a koeficienty rastu z pretekov sú EXP).

### 7.1 Aký rast jazdca je primeraný?
* **Dnešné tempo je pre 12 sezón príliš pomalé na to, aby hráč videl OVR rásť.** Medián +{f0(snap(sm,12)['growth']['median'])} až +{f0(snap(mx,12)['growth']['median'])} OVR (130 → 134–135) znamená zmenu celočíselného OVR približne raz za 3 sezóny. Rast jednotlivých atribútov je viditeľnejší (trénovaný výkonnostný atribút ≈ +{f0(PERF12['specialist']*7)}, Skúsenosti +{f1(snap(sm,12)['groups']['experience']['gain'])}, Taktika +{f1(snap(sm,12)['groups']['tactics']['gain'])} na atribút), no OVR ho zrieďuje: tréning zasahuje 1 z 19 atribútov a jeden bod atribútu je 0,03–0,07 OVR.
* **Navrhovaný cieľ na rozhodnutie:** medián ≈ +7 až +10 OVR po 12 sezónach, 95. percentil ≈ +12 až +15, najlepší jazdec ≈ +20. K tomu by viedlo: výraznejší rast z pretekov ({SN['smart']}: +{f1(g12('bold:smart'))} namiesto +{f1(g('smart'))}), silnejší technický tréning (viď 7.2) a/alebo rýchlejší rast Výkonu. Zvýšenie `BASE_TRAINING` je lineárne (analýza, nie simulácia v tomto behu); to je zmena schváleného vzorca, preto ju neodporúčam bez samostatného rozhodnutia.
* **Rozdiely medzi stratégiami sú malé** (OVR +{f1(g('smart'))} … +{f1(g('maxTraining'))}), kým Výkon sa líši výrazne (+{f1(PERF12['smart'])} … +{f1(PERF12['maxTraining'])}, teoretický strop +{f1(PERF12['oracle'])}). Rozhodnutia hráča sa dnes prejavia najmä v Taktike/Technike/Skúsenostiach a v kondícii, menej v OVR.

### 7.2 Ktoré koeficienty ponechať alebo upraviť
| Oblasť | Odporúčanie | Dôvod z výsledkov |
|:---|:---|:---|
| Vzorec rastu Výkonu, `BASE_TRAINING 3`, prah 12, počty jednotiek, tabuľka pripravenosti, vekové faktory | **Ponechať** | Správajú sa konzistentne; parita testovaná; denné rozdelenie týždňa rast nezvyšuje. |
| Denná regenerácia `8 + round(8R/100)`, `5 + round(6R/100)`, 100 % / 50 % | **Ponechať** | Normálny a ľahký tréning sú udržateľné pre všetkých; regenerácia vytvára reálne rozdiely v Tour. |
| Hranica 30/75 | **Ponechať ako ochranu** | Pri −22/+16 zníži dni vyčerpania z {f0(R('nogate:maxTraining')['exhaustedDaysMean'])} na {f0(mx['exhaustedDaysMean'])} na jazdca bez straty rastu (OVR {f2(g12('nogate:maxTraining'))} → {f2(g('maxTraining'))}). |
| Záťaž tvrdej jednotky | **−20 / +15** | Najvyšší rast spomedzi variantov ({f2(g12('load:maxTraining:h20'))} OVR), najmenej dní vyčerpania a vynechaných jednotiek. **Pozor:** pri plnej záťaži etapy sú vyčerpaní {pc(mx['exhaustedRiders']/N)} jazdcov pri akejkoľvek z troch hodnôt; to nerieši tréningová záťaž, ale kombinácia s Tour (viď záťaž etapy). |
| Záťaž etapy | **Nezaviesť, kým engine nemá reálne hodnoty** | Pri mierke 0,6 je vyčerpaných {pc(R('race06:maxTraining')['exhaustedRiders']/N)} namiesto {pc(mx['exhaustedRiders']/N)}. Je to najcitlivejšia neoverená vstupná hodnota. |
| Rast Taktiky/Techniky/Skúsenosti z pretekov | **Výraznejší variant** (alebo medzi) s ročnými stropmi 3 / 4 / 3 | Konzervatívny variant dá Taktike len ~0,6 bodu za sezónu; výraznejší ~1,1. Stropy bránia, aby 4 Tour „roztiahli“ rast. Skúsenosti rastú takmer deterministicky (+{f1(snap(sm,12)['groups']['experience']['gain'])} / +{f1(snap(R('bold:smart'),12)['groups']['experience']['gain'])} za 12 sezón). |
| `TECHNICAL_BASE 2.0` a +1/plán | **Na prehodnotenie** | Technický plán dnes dá počas 12 sezón len ~+{f1(snap(cx,12)['groups']['technique']['gain']-snap(R(mainid('noTrainRace')),12)['groups']['technique']['gain'])} bodu priemeru Techniky navyše oproti iba pretekom (Komplexný vs. iba preteky) — je prakticky bezvýznamný. |
| Mapovanie skrytých hodnôt | **Rozhodnúť:** priama 1–100 spomalí priemerný rast o {f2(mapG['specialist'])}–{f2(mapG['maxTraining'])} OVR oproti dnešnej kalibrácii | Pri priamej škále sa musia upraviť konštanty (alebo ostať mapovanie). |
| Pokles schopností (starnutie) | **Zatiaľ nezavádzať** | Pri štarte 18–22 a 12 sezónach sa k veku 31+ dostane len koniec populácie ({f2(g12('decline:smart') - g('smart'))} OVR). Potrebuje samostatný návrh (dlhšia kariéra). |

### 7.3 Sú štyri Tour vhodnejšie ako tri?
* **Pre rast OVR je rozdiel malý a závisí od stratégie:** štyri Tour dajú OVR {sg(g('specialist')-g12('t3:specialist'))} (Špecialista), {sg(g('complex')-g12('t3:complex'))} (Komplexný), {sg(g('maxTraining')-g12('t3:maxTraining'))} (Maximálny), {sg(g('noTrainRace')-g12('t3:noTrainRace'))} (iba preteky), ale {sg(g('smart')-g12('t3:smart'))} (Inteligentný). Taktika/Technika/Skúsenosti rastú o ~28 % viac.
* **Pre Výkon horšie:** −1 tréningový týždeň za sezónu (5 vs. 6) = Výkon −{f0((1-PERF12['specialist']/perf('t3:specialist'))*100)} % pri Špecialistovi a −{f0((1-PERF12['smart']/perf('t3:smart'))*100)} % pri Inteligentnom manažérovi.
* **Pre kondíciu horšie:** viac Tour → viac dní únavy a menej priestoru na tvrdý tréning (Maximálny tréning odjazdí {pc(mx['tour']['tiredShare'])} etáp unavený pri 4 Tour vs. {pc(R('t3:maxTraining')['tour']['tiredShare'])} pri 3).
* **Odporúčanie:** ponechať **3 Tour**, kým nepoznáme reálnu záťaž etáp — štyri Tour nepridajú k OVR dosť na to, aby vyvážili stratu Výkonu a kondície. Štyri Tour majú zmysel iba ak sa dizajnovo chce, aby pretekanie (nie tréning) tvorilo väčšinu rastu Taktiky a Skúsenosti. Štvrtá Tour by tiež vyžadovala rozhodnutie o kalendári (v existujúcom sú týždne 2, 5, 7 a 9 už obsadené piatimi Tour).

### 7.4 Ako nastaviť potenciál, aby mal význam počas celej kariéry
* Dnešný vzorec: potenciál **nemá žiadny účinok** (rast pri potenciáli 10 / 50 / 95 = {sp(c_exist,'potential')}).
* **Model A (absolútny strop)** a **model B (relatívny priestor)** zavedú potenciál len ako **spomalenie blízko osobného stropu**: jazdec s potenciálom 10 vyrastie o {f1(hl(c_exp,'potential 10'))} (A) / {f1(hl(c_rel,'potential 10'))} (B) bodov Výkonu oproti {f1(hl(c_exp,'potential 50'))} pri potenciáli 50; potenciál 95 = {f1(hl(c_exp,'potential 95'))} (nad strop sa nezrýchľuje). Jazdec s vysokým potenciálom a priemernou trénovateľnosťou predbehne rýchlo sa učiaceho jazdca s nízkym potenciálom už v {fmt_cross(cross_x)} (A) / {fmt_cross(cross_r)} (B), pri existujúcom vzorci nikdy.
* **Obmedzenie:** pri dnešnom tempe rastu (+{f1(PERF12['specialist'])} bodu Výkonu za 12 sezón) sa k osobnému stropu priblíži len jazdec s nízkym potenciálom; jazdci so stredným a vysokým potenciálom sú nerozlíšiteľní. Potenciál bude mať „význam počas celej kariéry“ len ak (a) rastie tempo rastu, alebo (b) sa strop posunie bližšie k štartovnej úrovni (model B s vyšším základom), alebo (c) kariéra trvá dlhšie než 12 sezón.
* **Odporúčanie:** prijať **model B (relatívny priestor)** ako východisko, lebo dáva potenciálu intuitívny význam („koľko môže jazdec ešte vyrásť od štartu“) a nie je to plošný násobiteľ; konkrétne konštanty (základ {META['experimentalParams']['potential']['rel']['base']}, sklon {META['experimentalParams']['potential']['rel']['slope']}, rozpätie 25) ladiť až spolu s rozhodnutím o tempe rastu.

### 7.5 Vytvárajú štyri skryté vlastnosti dostatočne rozdielnych jazdcov?
| Vlastnosť | Verdikt | Dôkaz |
|:---|:---|:---|
| Trénovateľnosť | **Áno — dominuje** | Rast OVR {f2(tr_bands[0]['growth'])} (pásmo 1–20) vs. {f2(tr_bands[5]['growth'])} (96–100); unikátne {f1(reg_s['drop']['trainability']*100)} % rozptylu. |
| Regenerácia | **Áno, ale iba pri záťaži** | V Tour pri maximálnom tréningu účinnosť ×{low_rec_mx[0]['stageREff']:.2f} vs. ×{low_rec_mx[5]['stageREff']:.2f}; pri Inteligentnom plánovaní rozdiely takmer miznú. Na rast OVR vplýva {f1(reg_s['drop']['recovery']*100)} %. Rozdiel v dňoch vyčerpania je dramatický ({f0(low_rec_mx[0]['exhaustedDays'])} vs. {f0(low_rec_mx[5]['exhaustedDays'])} dní). |
| Profesionalita | **Slabo** | Rast OVR {f2(R(mainid('smart'))['byHidden']['professionalism'][0]['growth'])} → {f2(R(mainid('smart'))['byHidden']['professionalism'][5]['growth'])} (rozsah ~+{f0((R(mainid('smart'))['byHidden']['professionalism'][5]['growth']/R(mainid('smart'))['byHidden']['professionalism'][0]['growth']-1)*100)} %), lebo faktor je len 0,8–1,0. |
| Potenciál | **Nie** (dnes) | Žiadny účinok pod výkonom 140; v experimentálnych modeloch len spomalenie nízkeho potenciálu. |

Odporúčanie: trénovateľnosť a regenerácia stačia na rozlíšenie jazdcov; profesionalite treba dať väčší alebo iný účinok (napr. širší rozsah faktora, alebo vplyv na stabilitu pripravenosti), potenciál potrebuje rozhodnutie z 7.4.

### 7.6 Mechaniky, ktoré ešte potrebujú rozhodnutie
1. **Záťaž etapy** (energia/únava) a **dni etáp** — engine ju zatiaľ neposkytuje; rozhodnúť, či sa použije odvodenie z konštanty enginu (návrh v §2.1) alebo iný model.
2. **Výsledky pretekov a väzba na stav jazdca** — bez nich nie je možné stanoviť skutočnú cenu únavy; v tejto simulácii len znižuje účinnosť rastu z pretekov.
3. **Rast Taktiky, Techniky a Skúsenosti** — konzervatívny vs. výraznejší variant, stropy, váhy etáp, zdieľaný akumulátor (§2.2).
4. **Technický tréning** — sila (`TECHNICAL_BASE`) a cap +1/plán.
5. **Potenciál** — model B, konštanty a tempo rastu (7.4).
6. **Mapovanie skrytých hodnôt** — priama škála 1–100 vs. dnešná 55–95 a nutná rekalibrácia.
7. **Tvrdá jednotka** (−20/+15 odporúčané), **hranica 30/75** (odporúčané ponechať) a **počet Tour** (3 vs. 4).
8. **Pokles schopností v staršom veku** — dnes neexistuje, nie je súčasťou pravidiel; ak sa zavedie, treba ho zladiť s dĺžkou kariéry (12 sezón je málo na jeho prejav) a s retention bonusom Tréningového centra L5.
9. **Forma, kondícia, morálka** — produkcia ich nemení; model v §2.5 je len ilustračný.
10. **Rookie OVR limity**, typy jazdcov, skryté talenty, prestupy, kontrakty a postup medzi ligami — podľa zadania neimplementované ani nesimulované.
"""


open(os.path.join(HERE, '../../TRAINING_CAREER_SIMULATION.md'), 'w', encoding='utf8').write(write_report())
print('report written')
