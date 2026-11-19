# OVERENIE ZÁLOHY: integrita + obsah (vrátane hodnôt, nielen počtov) + sekvencie + úplnosť. Nepripája sa na databázu a nepýta heslo.
# Použitie: 02_over_zalohu.cmd  (alebo s cestou k priečinku zálohy)
param([string]$Priecinok = '')
. (Join-Path (Join-Path $PSScriptRoot 'lib') '_spolocne.ps1')
$script:ok = 0; $script:chyby = 0; $script:varovania = 0; $script:nevyhodnotene = 0; $koniec = 0
function V-Ok($t) { $script:ok++; Ok $t }
function V-Chyba($t) { $script:chyby++; Chyba $t }
function V-Varuj($t) { $script:varovania++; Varuj $t }
function V-Nev($t) { $script:nevyhodnotene++; $script:varovania++; Varuj ("NEOVERITEĽNÉ: " + $t) }
$tmp = $null; $D = $null
try {
    $tools = @(Find-PgTools)
    if ($tools.Count -eq 0) { Stop-Skript 'Chýba pg_restore. Spusti najprv 00_over_nastroje.' }
    $t = $tools[0]
    if ($Priecinok -eq '') {
        $koren = Get-KorenZaloh
        $posl = @(Get-ChildItem -LiteralPath $koren -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending)
        if ($posl.Count -eq 0) { Stop-Skript "V '$koren' nie je žiadna záloha. Najprv spusti 01_zaloha." }
        $Priecinok = $posl[0].FullName
    }
    $D = Test-MiestoZalohy $Priecinok
    if (-not (Test-Path -LiteralPath $D)) { Stop-Skript "Priečinok '$D' neexistuje." }
    Nadpis "Overujem zálohu: $D"

    Nadpis 'A. Súbory a kontrolné súčty (integrita)'
    foreach ($f in @('uplna_zaloha.dump', 'public_struktura_a_data.sql', 'inventar_pred.txt', 'inventar_po.txt', 'obsah_pred.txt', 'obsah_po.txt', 'SHA256SUMS.txt', 'POPIS_ZALOHY.txt')) {
        $c = Join-Path $D $f
        if ((Test-Path -LiteralPath $c) -and ((Get-Item -LiteralPath $c).Length -gt 0)) { V-Ok "súbor $f existuje a nie je prázdny" } else { V-Chyba "súbor $f chýba alebo je prázdny" }
    }
    if ($script:chyby -gt 0) { throw 'STOP: chýbajú základné súbory zálohy.' }
    $popis = @{}
    foreach ($l in @(Get-Content -LiteralPath (Join-Path $D 'POPIS_ZALOHY.txt') -Encoding UTF8)) { $i = $l.IndexOf('='); if ($i -gt 0) { $popis[$l.Substring(0, $i)] = $l.Substring($i + 1) } }
    $rozsah = $popis['ROZSAH']
    if (@('plna', 'public') -notcontains $rozsah) { V-Chyba "POPIS_ZALOHY.txt má neznámy ROZSAH '$rozsah'." }
    foreach ($l in @(Get-Content -LiteralPath (Join-Path $D 'SHA256SUMS.txt') -Encoding UTF8)) {
        if ([string]::IsNullOrWhiteSpace($l)) { continue }
        $a = $l -split '\s+', 2
        $c = Join-Path $D $a[1]
        if (-not (Test-Path -LiteralPath $c)) { V-Chyba "súbor $($a[1]) z kontrolných súčtov chýba"; continue }
        if ((Get-FileHash -LiteralPath $c -Algorithm SHA256).Hash.ToLowerInvariant() -eq $a[0]) { V-Ok "kontrolný súčet sedí: $($a[1])" } else { V-Chyba "kontrolný súčet NESEDÍ: $($a[1]) (súbor sa poškodil alebo zmenil)" }
    }

    Nadpis 'B. Záloha je čitateľná programom pg_restore'
    if ($t.Major -lt [int]$popis['PG_DUMP_MAJOR']) { V-Chyba "pg_restore ($($t.Major)) je starší než pg_dump, ktorý zálohu vyrobil ($($popis['PG_DUMP_MAJOR'])). Nainštaluj novší." }
    $dump = Join-Path $D 'uplna_zaloha.dump'
    $lst = Invoke-Pg $t.Restore @('--list', $dump)
    if ($lst.Code -ne 0) { V-Chyba ("pg_restore záložný súbor neprečíta: " + ($lst.Err.Trim() -split "`n")[0]); throw 'STOP: súbor zálohy je nečitateľný.' }
    $obsah = @($lst.Out -split "`n" | Where-Object { $_ -match '^\d+; ' })
    V-Ok ("pg_restore prečítal záložný súbor ($($obsah.Count) objektov)")

    Nadpis 'C. Úplnosť: povinné tabuľky (public, auth, storage metadáta)'
    $pre = Read-Inventar (Join-Path $D 'inventar_pred.txt'); $po = Read-Inventar (Join-Path $D 'inventar_po.txt')
    $obPre = Read-Inventar (Join-Path $D 'obsah_pred.txt'); $obPo = Read-Inventar (Join-Path $D 'obsah_po.txt')
    $tabKluce = @($pre.Keys | Where-Object { $_ -like 'table|*' })
    if (@($tabKluce | Where-Object { $_ -like 'table|public.*' }).Count -eq 0) { V-Chyba "V odtlačku nie je žiadna tabuľka v 'public' – to je podozrivé; záloha sa nedá považovať za úplnú." }
    if ($rozsah -eq 'plna') {
        foreach ($rq in @('auth.users', 'auth.identities', 'storage.buckets', 'storage.objects')) {
            if (-not $pre.Contains("table|$rq")) { V-Chyba "povinná tabuľka $rq chýba v odtlačku databázy – úplnosť zálohy sa nedá preukázať." }
        }
        foreach ($tx in @('SCHEMA - auth', 'SCHEMA - storage')) { if (@($obsah | Where-Object { $_ -match [regex]::Escape($tx) }).Count -eq 0) { V-Chyba "v zálohe chýba $tx" } }
    }
    if ($script:chyby -eq 0) { V-Ok 'všetky povinné tabuľky sú v odtlačku' }

    Nadpis 'D. Obsah: počty riadkov A hodnoty (odtlačok každého riadku) – prázdna tabuľka nie je chyba'
    $tmp = Join-Path $D '_tmp_overenie'; New-Item -ItemType Directory -Path $tmp -Force | Out-Null
    $dumpTab = @{}; $dumpSeq = @{}
    $schemyInv = @($tabKluce | ForEach-Object { ($_ -replace '^table\|', '').Split('.')[0] } | Select-Object -Unique)
    foreach ($s in $schemyInv) {
        $o = Join-Path $tmp "data_$s.sql"
        $r = Invoke-Pg $t.Restore @('--data-only', '--schema', $s, '--file', $o, $dump)
        if ($r.Code -ne 0) { V-Chyba "z dumpu sa nepodarilo vyčítať dáta schémy '$s': $(($r.Err.Trim() -split "`n")[0])"; continue }
        $pp = [ZalohaHash]::Subor($o)
        foreach ($k in $pp.Keys) { if ($k.StartsWith('tab|')) { $dumpTab[$k.Substring(4)] = $pp[$k] } else { $dumpSeq[$k.Substring(4)] = $pp[$k] } }
        Remove-Item -LiteralPath $o -Force
    }
    $nOk = 0; $nPrazdne = 0
    $kNieArch = New-Object System.Collections.ArrayList; $kArchiv = New-Object System.Collections.ArrayList; $kOver = New-Object System.Collections.ArrayList; $kNeov = [ordered]@{}
    foreach ($k in $tabKluce) {
        $nm = $k -replace '^table\|', ''; $sch = $nm.Split('.')[0]; $tab = $nm.Substring($sch.Length + 1)
        $maDef = @($obsah | Where-Object { $_ -match ('^\d+; \d+ \d+ TABLE ' + [regex]::Escape("$sch $tab") + ' ') }).Count -gt 0
        $preV = [string]$pre[$k]; $poV = $preV; if ($po.Contains($k)) { $poV = [string]$po[$k] }
        if (-not $maDef) {
            if ($rozsah -eq 'public' -and $sch -ne 'public') { [void]$kNieArch.Add($nm); continue }
            V-Chyba "tabuľka $nm v zálohe vôbec nie je (v databáze existuje)"; continue
        }
        [void]$kArchiv.Add($nm)
        if ($preV -eq 'ERR' -or $poV -eq 'ERR') { $kNeov[$nm] = 'rola nemala právo čítať tabuľku – je v archíve, ale jej obsah sa nedá porovnať'; V-Nev "tabuľka $nm sa nedala prečítať (chýbajú práva); je v archíve, obsah neoverený."; continue }
        $a = [int]$preV; $b = [int]$poV
        $lo = [math]::Min($a, $b); $hi = [math]::Max($a, $b)
        $v = '0|0'; if ($dumpTab.ContainsKey($nm)) { $v = [string]$dumpTab[$nm] }
        $vp = [int]($v.Split('|')[0])
        if (-not $dumpTab.ContainsKey($nm) -and $hi -gt 0) { V-Chyba "tabuľka $nm má v databáze $a riadkov, ale jej DÁTA v zálohe chýbajú"; continue }
        if ($vp -lt $lo -or $vp -gt $hi) { V-Chyba "tabuľka ${nm}: v databáze $a (po zálohe $b) riadkov, v zálohe $vp"; continue }
        $cmp = Porovnaj-Obsah $obPre $obPo $nm $v
        if ($cmp -eq 'ok') { [void]$kOver.Add($nm); if ($vp -eq 0) { $nPrazdne++ } else { $nOk++ } }
        elseif ($cmp -eq 'zle') { V-Chyba "OBSAH tabuľky $nm v zálohe SA LÍŠI od databázy (aj keď počet riadkov môže sedieť): niektoré hodnoty sú iné." }
        else { $kNeov[$nm] = 'obsah sa nedal porovnať (odtlačok chýba/zlyhal alebo sa tabuľka počas zálohy menila)'; V-Nev "obsah tabuľky $nm sa nedá porovnať (odtlačok pri zálohe chýba/zlyhal alebo sa tabuľka počas zálohy menila). Zopakuj zálohu, keď nikto nehrá." }
    }
    # Tabuľky, ktoré sú v archíve (TABLE DATA) v schémach public/auth/storage, ale NIE sú v odtlačku databázy: nedajú sa overiť.
    $ineSchemy = @{}
    foreach ($e in $obsah) {
        $m = [regex]::Match($e, '^\d+; \d+ \d+ TABLE DATA (\S+) (\S+) ')
        if (-not $m.Success) { continue }
        $es = $m.Groups[1].Value; $nm = $m.Groups[1].Value + '.' + $m.Groups[2].Value
        if (@('public', 'auth', 'storage') -contains $es) {
            if (-not $pre.Contains("table|$nm")) { [void]$kArchiv.Add($nm); $kNeov[$nm] = 'je v archíve, ale nebola v odtlačku databázy – obsah sa nedá porovnať'; V-Nev "tabuľka $nm je v archíve, ale nie je v odtlačku databázy (obsah neoverený)." }
        } else { if ($ineSchemy.ContainsKey($es)) { $ineSchemy[$es]++ } else { $ineSchemy[$es] = 1 } }
    }
    V-Ok "$nOk tabuliek s dátami má v zálohe zhodný OBSAH (každý riadok); $nPrazdne prázdnych tabuliek (v poriadku)"
    $perSch = @($kArchiv | ForEach-Object { $_.Split('.')[0] } | Group-Object | ForEach-Object { "{0}: {1}" -f $_.Name, $_.Count }) -join ', '
    Write-Host ''
    Write-Host '  ROZSAH OVERENIA (public, auth, storage):' -ForegroundColor Cyan
    Info ("V ARCHÍVE: {0} tabuliek ({1})" -f $kArchiv.Count, $perSch)
    Info ("OBSAHOVO OVERENÉ (každý riadok): {0}" -f $kOver.Count)
    if ($kNieArch.Count -gt 0) { V-Varuj ("NIE SÚ V ARCHÍVE ({0}; záloha je ČIASTOČNÁ, iba public): {1}" -f $kNieArch.Count, ($kNieArch -join ', ')) }
    if ($kNeov.Count -gt 0) { Varuj ("NEOVERENÉ ({0}) – sú v archíve, ale obsah sa nepreukázal: {1}" -f $kNeov.Count, ($kNeov.Keys -join ', ')) } elseif ($script:chyby -eq 0) { Ok 'NEOVERENÉ: žiadne tabuľky' }
    if ($ineSchemy.Count -gt 0) { Info ("V archíve sú aj ďalšie schémy, ktorých OBSAH sa z princípu NEOVERUJE: " + (($ineSchemy.Keys | Sort-Object | ForEach-Object { "{0} ({1} tabuliek)" -f $_, $ineSchemy[$_] }) -join ', ')) }
    $rozsahTxt = @("V_ARCHIVE=$($kArchiv.Count) ($perSch)", ("OBSAHOVO_OVERENE=$($kOver.Count): " + ($kOver -join ', ')), "NEOVERENE=$($kNeov.Count)", ("NIE_SU_V_ARCHIVE=$($kNieArch.Count): " + ($kNieArch -join ', ')))
    foreach ($kk in $kNeov.Keys) { $rozsahTxt += "  $kk : $($kNeov[$kk])" }
    $rozsahTxt += 'INE_SCHEMY_V_ARCHIVE_NEOVERENE=' + (($ineSchemy.Keys | Sort-Object | ForEach-Object { "{0}({1})" -f $_, $ineSchemy[$_] }) -join ', ')
    $rozsahTxt += 'VZDY_NEOVERENE=sekvencie mimo public; funkcie, triggery a politiky mimo public; obsah tabuliek mimo public/auth/storage; subory v Storage; Vault; Edge Functions; secrets; nastavenia projektu; roly'
    Zapis-Text (Join-Path $D 'ROZSAH_OVERENIA.txt') (($rozsahTxt -join "`r`n") + "`r`n")

    Nadpis 'E. Sekvencie (aby po obnove nevznikli duplicitné ID)'
    $nSeq = 0
    foreach ($k in @($pre.Keys | Where-Object { $_ -like 'seq|*' })) {
        $nm = $k -replace '^seq\|', ''
        $pv = ''; if ($po.Contains($k)) { $pv = [string]$po[$k] }
        if (-not $dumpSeq.ContainsKey($nm)) { V-Chyba "sekvencia $nm nemá v zálohe nastavený stav – po obnove by hrozili duplicitné ID"; continue }
        if (Test-Sekvencia ([string]$pre[$k]) $pv ([string]$dumpSeq[$nm])) { $nSeq++ } else { V-Chyba ("sekvencia {0}: v databáze '{1}' (po zálohe '{2}'), v zálohe '{3}'" -f $nm, $pre[$k], $pv, $dumpSeq[$nm]) }
    }
    if (@($pre.Keys | Where-Object { $_ -like 'seq|*' }).Count -eq 0) { V-Varuj 'v odtlačku nie sú žiadne sekvencie (public) – ak tabuľky používajú automatické ID, je to podozrivé.' } else { V-Ok "$nSeq sekvencií má v zálohe správny stav" }

    Nadpis 'F. Čitateľná SQL záloha schémy public (počty aj hodnoty)'
    $pq = [ZalohaHash]::Subor((Join-Path $D 'public_struktura_a_data.sql')); $bad = 0
    foreach ($k in @($tabKluce | Where-Object { $_ -like 'table|public.*' })) {
        $nm = $k -replace '^table\|', ''; $v = '0|0'; if ($pq.ContainsKey("tab|$nm")) { $v = [string]$pq["tab|$nm"] }
        $a = [int]$pre[$k]; $b = $a; if ($po.Contains($k)) { $b = [int]$po[$k] }
        $vp = [int]($v.Split('|')[0])
        if ($vp -lt [math]::Min($a, $b) -or $vp -gt [math]::Max($a, $b)) { $bad++; V-Chyba "SQL záloha public: tabuľka $nm má $vp riadkov, v databáze $a"; continue }
        if ((Porovnaj-Obsah $obPre $obPo $nm $v) -eq 'zle') { $bad++; V-Chyba "SQL záloha public: OBSAH tabuľky $nm sa líši od databázy" }
    }
    if ($bad -eq 0) { V-Ok 'SQL záloha public má rovnaké počty riadkov aj hodnoty ako databáza (kde sa dalo overiť)' }

    Nadpis 'G. Funkcie, triggery, politiky RLS, indexy'
    function Pocet([string]$typ) { return @($obsah | Where-Object { $_ -match ('^\d+; \d+ \d+ ' + $typ + ' public ') }).Count }
    $porov = @(@('functions', ('FUNCTION', 'PROCEDURE')), @('triggers', ('TRIGGER')), @('policies', ('POLICY')), @('indexes', ('INDEX', 'CONSTRAINT')))
    foreach ($pv in $porov) {
        $kluc = $pv[0] + '|public'
        if (-not $pre.Contains($kluc)) { V-Chyba "v odtlačku chýba $kluc"; continue }
        $a = [int]($pre[$kluc].Split('|')[0]); $b = $a; if ($po.Contains($kluc)) { $b = [int]($po[$kluc].Split('|')[0]) }
        $v = 0; foreach ($ty in $pv[1]) { $v += (Pocet $ty) }
        if ($v -ge [math]::Min($a, $b) -and $v -le [math]::Max($a, $b)) { V-Ok ("počet {0}: {1} (sedí s databázou)" -f $pv[0], $v) } else { V-Chyba ("počet {0}: v databáze {1}, v zálohe {2}" -f $pv[0], $a, $v) }
    }

    Nadpis 'H. Sprievodné súbory neobsahujú heslá ani spojenie'
    $sprievodne = @('POPIS_ZALOHY.txt', 'SHA256SUMS.txt', 'inventar_pred.txt', 'inventar_po.txt', 'obsah_pred.txt', 'obsah_po.txt', 'info_projektu.txt', 'log_zaloha.txt', 'STAV_ZALOHY.txt')
    $unik = 0
    foreach ($f in $sprievodne) {
        $c = Join-Path $D $f
        if (Test-Path -LiteralPath $c) { $txt = Get-Content -LiteralPath $c -Raw -Encoding UTF8; if ($txt -match 'postgres(ql)?://[^\s:/]+:[^\s@]+@' -or $txt -match '(?i)\bpassword\s*[=:]\s*\S{4,}') { $unik++; V-Chyba "súbor $f vyzerá, že obsahuje heslo alebo connection string!" } }
    }
    if ($unik -eq 0) { V-Ok 'v sprievodných súboroch nie je heslo ani connection string' }

    Nadpis 'VÝSLEDOK'
    $obmedz = @('samotné súbory zo Storage', 'Vault tajomstvá', 'Edge Functions, secrets a env premenné', 'nastavenia Auth/SMTP/URL', 'roly a ich heslá')
    if ($script:chyby -gt 0) { $stav = 'NEPLATNA'; Write-Host "ZÁLOHA JE NEPLATNÁ ($($script:chyby) chýb). Nepoužívaj ju ako poistku a NESPÚŠŤAJ migráciu A. Zopakuj zálohu." -ForegroundColor Red; $koniec = 1 }
    elseif ($rozsah -ne 'plna') { $stav = 'CIASTOCNA'; Write-Host 'ZÁLOHA JE ČIASTOČNÁ: obsah schémy public je overený, ale auth (používatelia) a storage metadáta v nej NIE SÚ. Neoznačujem ju za úplnú.' -ForegroundColor Yellow; $koniec = 2 }
    elseif ($script:nevyhodnotene -gt 0) { $stav = 'NEUPLNE_OVERENA'; Write-Host "ZÁLOHA JE NEÚPLNE OVERENÁ: $($script:nevyhodnotene) vecí sa nedalo porovnať (databáza sa počas zálohy menila, tabuľka sa nedala prečítať alebo nie je v odtlačku databázy). Chyby sa nenašli, ale úplnú zálohu netvrdím. Zopakuj 01, keď nikto nehrá." -ForegroundColor Yellow; $koniec = 2 }
    else { $stav = 'UPLNA_DATABAZA'; Write-Host 'ZÁLOHA DATABÁZY JE ÚPLNÁ A OVERENÁ (public, auth, storage metadáta; integrita, počty riadkov, hodnoty a sekvencie sedia).' -ForegroundColor Green }
    if ($stav -ne 'NEPLATNA') { Write-Host ('Pozor, aj tak v nej NIE JE: ' + ($obmedz -join '; ') + '.') -ForegroundColor Yellow }
    Info "(v poriadku: $($script:ok), varovania: $($script:varovania), neoveriteľné: $($script:nevyhodnotene), chyby: $($script:chyby))"
    $dumpSha = (Get-FileHash -LiteralPath $dump -Algorithm SHA256).Hash.ToLowerInvariant()
    Zapis-Text (Join-Path $D 'STAV_ZALOHY.txt') ("STAV=$stav`r`nROZSAH=$rozsah`r`nDUMP_SHA256=$dumpSha`r`nDATUM_OVERENIA=$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')`r`nCHYBY=$($script:chyby)`r`nNEOVERITELNE=$($script:nevyhodnotene)`r`nTABULKY_V_ARCHIVE=$($kArchiv.Count)`r`nTABULKY_OBSAHOVO_OVERENE=$($kOver.Count)`r`nTABULKY_NEOVERENE=$($kNeov.Count)`r`nVAROVANIA=$($script:varovania)`r`nNIE_JE_V_ZALOHE=$($obmedz -join '; ')`r`n")
    Info 'Odporúčané ešte: skúšobná obnova (03_skusobna_obnova) – jediný dôkaz, že sa záloha dá aj skutočne obnoviť.'
} catch {
    Chyba (Mask-Text $_.Exception.Message); $koniec = 1
    Write-Host 'ZÁLOHA NIE JE OVERENÁ. Nespúšťaj migráciu A.' -ForegroundColor Red
    try { if ($D -and (Test-Path -LiteralPath $D)) { Zapis-Text (Join-Path $D 'STAV_ZALOHY.txt') ("STAV=NEPLATNA`r`nDATUM_OVERENIA=$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')`r`nDOVOD=overenie skoncilo chybou`r`n") } } catch {}
} finally {
    if ($tmp -and (Test-Path -LiteralPath $tmp)) { Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue }
}
exit $koniec
