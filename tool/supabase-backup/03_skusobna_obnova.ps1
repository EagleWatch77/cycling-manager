# SKÚŠOBNÁ OBNOVA – výhradne do LOKÁLNEHO PostgreSQL na tomto počítači (localhost). Produkcia sa nepoužíva a heslo od produkcie sa tu NEZADÁVA.
# Skript nikdy nemení ani nemaže nič okrem skúšobnej databázy 'zaloha_test_RRRRMMDD_HHMMSS', ktorú si sám vytvorí.
# Zelený výsledok vznikne IBA ak: záloha má STAV=UPLNA_DATABAZA, pg_restore skončil s kódom 0 bez jedinej chyby a všetko (počty, hodnoty, sekvencie, objekty) sedí.
param([string]$Priecinok = '')
. (Join-Path (Join-Path $PSScriptRoot 'lib') '_spolocne.ps1')
$koniec = 0; $testDb = $null; $t = $null; $conn = $null
# Chyby pg_restore, ktoré vznikajú len kvôli rozdielu medzi lokálnym PostgreSQL a Supabase. Všetko ostatné je NEVYHODNOTENÁ chyba.
$ocakavaneLokalne = @(
    'extension "[^"]+" is not available',
    'could not open extension control file',
    'role "[^"]+" does not exist'
)
try {
    Reset-PgProstredie
    $env:PGSSLMODE = 'prefer'   # lokálny server zvyčajne nemá SSL
    $tools = @(Find-PgTools)
    if ($tools.Count -eq 0) { Stop-Skript 'Chýbajú nástroje PostgreSQL (pozri NAVOD).' }
    $t = $tools[0]
    if ($Priecinok -eq '') {
        $posl = @(Get-ChildItem -LiteralPath (Get-KorenZaloh) -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending)
        if ($posl.Count -eq 0) { Stop-Skript 'Nenašiel som žiadnu zálohu. Najprv 01_zaloha a 02_over_zalohu.' }
        $Priecinok = $posl[0].FullName
    }
    $D = Test-MiestoZalohy $Priecinok
    $dump = Join-Path $D 'uplna_zaloha.dump'
    if (-not (Test-Path -LiteralPath $dump)) { Stop-Skript "V '$D' nie je uplna_zaloha.dump." }

    # --- kontrola výsledku overenia 02: jedine STAV=UPLNA_DATABAZA môže viesť k zelenému výsledku ---
    $stavF = Join-Path $D 'STAV_ZALOHY.txt'
    if (-not (Test-Path -LiteralPath $stavF)) { Stop-Skript 'Záloha nemá výsledok overenia (STAV_ZALOHY.txt). Najprv spusti 02_over_zalohu.' }
    $st = @{}
    foreach ($l in @(Get-Content -LiteralPath $stavF -Encoding UTF8)) { $i = $l.IndexOf('='); if ($i -gt 0) { $st[$l.Substring(0, $i)] = $l.Substring($i + 1).Trim() } }
    $stavZalohy = ''; if ($st.ContainsKey('STAV')) { $stavZalohy = $st['STAV'] }
    if (@('UPLNA_DATABAZA', 'CIASTOCNA', 'NEUPLNE_OVERENA') -notcontains $stavZalohy) { Stop-Skript "Stav zálohy je '$stavZalohy' (neplatný, neznámy alebo chýba). Skúšobnú obnovu nespúšťam. Oprav zálohu a spusti 02_over_zalohu." }
    if (-not $st.ContainsKey('DUMP_SHA256') -or ((Get-FileHash -LiteralPath $dump -Algorithm SHA256).Hash.ToLowerInvariant() -ne $st['DUMP_SHA256'])) { Stop-Skript 'Súbor zálohy sa od overenia 02 zmenil alebo overenie nie je platné. Spusti znova 02_over_zalohu.' }
    $obmedzenieStavu = $null
    if ($stavZalohy -ne 'UPLNA_DATABAZA') { $obmedzenieStavu = "záloha má stav $stavZalohy (nie UPLNA_DATABAZA)"; Varuj "Záloha má stav $stavZalohy. Skúšobná obnova prebehne, ale výsledok NIKDY nebude zelený 'úplná obnova'." }

    $popis = @{}
    foreach ($l in @(Get-Content -LiteralPath (Join-Path $D 'POPIS_ZALOHY.txt') -Encoding UTF8)) { $i = $l.IndexOf('='); if ($i -gt 0) { $popis[$l.Substring(0, $i)] = $l.Substring($i + 1) } }
    $prodMajor = [int]$popis['SERVER_MAJOR']; $tz = ''; if ($popis.ContainsKey('TIMEZONE')) { $tz = $popis['TIMEZONE'] }

    Nadpis 'Skúšobná obnova (iba lokálny server)'
    Write-Host 'Zadaj údaje LOKÁLNEHO PostgreSQL servera (tvoj počítač). NIE Supabase.' -ForegroundColor Cyan
    $lh = Read-Udaj 'Host [localhost]' 'localhost'
    $port = Read-Udaj 'Port [5432]' '5432'
    $user = Read-Udaj 'Používateľ [postgres]' 'postgres'
    Over-Udaj 'Host' $lh; Over-Udaj 'Používateľ' $user
    if (@('localhost', '127.0.0.1', '::1') -notcontains $lh.ToLowerInvariant()) { Stop-Skript "Skúšobná obnova smie ísť IBA na localhost / 127.0.0.1 / ::1. Zadal(a) si '$lh'. Z bezpečnostných dôvodov odmietam." }
    if ($port -notmatch '^\d{2,5}$') { Stop-Skript 'Port musí byť číslo.' }
    Read-Heslo 'Heslo LOKÁLNEHO PostgreSQL používateľa (nie Supabase; písanie sa nezobrazuje)'
    $conn = New-SpojenieArgs $lh $port $user 'postgres'

    $r = Invoke-Pg $t.Psql ($conn + @('-X', '-A', '-t', '-q', '-F', '|', '-c', "select current_setting('server_version_num')::int/10000, (select rolsuper from pg_roles where rolname = current_user)::text, coalesce(host(inet_server_addr()), 'socket')"))
    if ($r.Code -ne 0) { Stop-Skript ("Nepodarilo sa pripojiť na lokálny server:`n" + $r.Err.Trim() + "`nJe PostgreSQL nainštalovaný a spustený? (NAVOD, kapitola 'Skúšobná obnova')") }
    $pp = $r.Out.Trim().Split('|'); $lokMajor = [int]$pp[0]
    if ($pp[1] -ne 'true') { Stop-Skript 'Lokálny používateľ musí byť správca (superuser), napr. postgres.' }
    if (@('127.0.0.1', '::1', 'socket') -notcontains $pp[2]) { Stop-Skript "Server nie je na loopback adrese ($($pp[2])). Odmietam." }
    Info ("lokálny PostgreSQL {0}; produkčná databáza v čase zálohy: PostgreSQL {1}" -f $lokMajor, $prodMajor)
    if ($lokMajor -lt $prodMajor) { Stop-Skript "Lokálny server ($lokMajor) je starší než produkčná databáza ($prodMajor). Skúšobná obnova by nebola spoľahlivá. Nainštaluj PostgreSQL $prodMajor alebo novší (NAVOD)." }
    if ($t.Major -lt [int]$popis['PG_DUMP_MAJOR']) { Stop-Skript "pg_restore ($($t.Major)) je starší než pg_dump, ktorý zálohu vyrobil." }

    $testDb = 'zaloha_test_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
    Nadpis "1. Vytváram skúšobnú databázu $testDb (iba lokálne)"
    $c = Invoke-Pg $t.Psql ($conn + @('-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c', "create database $testDb"))
    if ($c.Code -ne 0) { $testDb = $null; Stop-Skript ("Databázu sa nepodarilo vytvoriť:`n" + $c.Err.Trim()) }
    $conn2 = New-SpojenieArgs $lh $port $user $testDb

    Nadpis '2. Vytváram štandardné supabase roly (bez hesiel, bez prihlásenia) v lokálnom serveri'
    $sqlRoly = "do `$x`$ declare r text; begin foreach r in array array['anon','authenticated','service_role','authenticator','supabase_admin','supabase_auth_admin','supabase_storage_admin','supabase_realtime_admin','supabase_read_only_user','dashboard_user','pgbouncer','supabase_replication_admin'] loop if not exists (select 1 from pg_roles where rolname = r) then execute format('create role %I nologin', r); end if; end loop; end `$x`$;"
    $c = Invoke-Pg $t.Psql ($conn2 + @('-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c', $sqlRoly))
    if ($c.Code -ne 0) { Stop-Skript ("Roly sa nepodarilo vytvoriť:`n" + $c.Err.Trim()) }
    Ok 'hotovo'

    Nadpis '3. Obnovujem celú zálohu do skúšobnej databázy'
    $vynechane = @('graphql', 'graphql_public', 'vault', 'pgsodium', 'pgsodium_masks', 'realtime', '_realtime', 'supabase_functions', 'net', 'pgbouncer')
    Info ('(neobnovujú sa iba schémy závislé od rozšírení, ktoré lokálny PostgreSQL nemá: ' + ($vynechane -join ', ') + ')')
    $rArgs = @('--no-owner'); foreach ($vs in $vynechane) { $rArgs += "--exclude-schema=$vs" }
    $rs = Invoke-Pg $t.Restore ($conn2 + $rArgs + @($dump))
    $logF = Join-Path $D 'log_skusobnej_obnovy.txt'
    Zapis-Text $logF $rs.Err
    $chybLines = @($rs.Err -split "`n" | Where-Object { $_ -match '^pg_restore: error:' } | ForEach-Object { $_.Trim() })
    $ocak = New-Object System.Collections.ArrayList; $neocak = New-Object System.Collections.ArrayList
    $chybajuceRozsirenia = @{}
    foreach ($e in $chybLines) { $m = [regex]::Match($e, 'extension "([^"]+)" is not available'); if ($m.Success) { $chybajuceRozsirenia[$m.Groups[1].Value] = $true } }
    foreach ($e in $chybLines) {
        $trieda = $false
        foreach ($pat in $ocakavaneLokalne) { if ($e -match $pat) { $trieda = $true } }
        # priamy dôsledok chýbajúceho rozšírenia (napr. COMMENT ON EXTENSION) – len ak to isté rozšírenie už bolo hlásené ako nedostupné
        $m2 = [regex]::Match($e, 'extension "([^"]+)" does not exist')
        if ($m2.Success -and $chybajuceRozsirenia.ContainsKey($m2.Groups[1].Value)) { $trieda = $true }
        if ($trieda) { [void]$ocak.Add($e) } else { [void]$neocak.Add($e) }
    }
    Info ("pg_restore skončil s kódom {0}; hlásení o chybách: {1} (očakávané lokálne rozdiely: {2}, NEVYHODNOTENÉ: {3}); log: {4}" -f $rs.Code, $chybLines.Count, $ocak.Count, $neocak.Count, $logF)
    Zapis-Text (Join-Path $D 'chyby_obnovy.txt') (("== OČAKÁVANÉ (rozdiel lokálny PostgreSQL vs Supabase) ==`r`n" + ($ocak -join "`r`n") + "`r`n== NEVYHODNOTENÉ ==`r`n" + ($neocak -join "`r`n") + "`r`n"))
    if ($neocak.Count -gt 0) { Varuj 'NEVYHODNOTENÉ chyby obnovy (prvých 8):'; $neocak | Select-Object -First 8 | ForEach-Object { $x = ($_ -replace '^pg_restore: error: ', '') -replace '\s+', ' '; if ($x.Length -gt 120) { $x = $x.Substring(0, 120) }; Info ("  " + $x) } }
    if ($ocak.Count -gt 0) { Info 'očakávané lokálne chyby (prvé 3):'; $ocak | Select-Object -First 3 | ForEach-Object { $x = ($_ -replace '^pg_restore: error: ', '') -replace '\s+', ' '; if ($x.Length -gt 120) { $x = $x.Substring(0, 120) }; Info ("  " + $x) } }
    $problemObnovy = ($rs.Code -ne 0 -or $chybLines.Count -gt 0)

    Nadpis '4. Odtlačky obnovenej databázy (počty, hodnoty, sekvencie, objekty) a porovnanie s produkciou v čase zálohy'
    $iv = Invoke-Pg $t.Psql ($conn2 + @('-X', '-A', '-t', '-q', '-F', '|', '-v', 'ON_ERROR_STOP=1', '-f', $script:InventorySql))
    if ($iv.Code -ne 0) { Stop-Skript ("Inventár obnovenej databázy zlyhal:`n" + $iv.Err.Trim()) }
    Zapis-Text (Join-Path $D 'inventar_obnovene.txt') $iv.Out
    $pre = Read-Inventar (Join-Path $D 'inventar_pred.txt'); $po = Read-Inventar (Join-Path $D 'inventar_po.txt'); $obn = Read-Inventar (Join-Path $D 'inventar_obnovene.txt')
    $obPre = Read-Inventar (Join-Path $D 'obsah_pred.txt'); $obPo = Read-Inventar (Join-Path $D 'obsah_po.txt')
    Write-Host '  Robím odtlačok OBSAHU obnovených tabuliek...'
    $zlObn = Write-ObsahHash $t $conn2 $obn (Join-Path $D 'obsah_obnovene.txt') $tz
    $obObn = Read-Inventar (Join-Path $D 'obsah_obnovene.txt')
    $vazne = New-Object System.Collections.ArrayList; $mensie = New-Object System.Collections.ArrayList; $nevyh = New-Object System.Collections.ArrayList; $zhoda = 0
    function Pridaj-Rozdiel([string]$kluc, [string]$text) { if ($kluc -match '(^|[|])(auth|storage)\.') { [void]$mensie.Add($text) } else { [void]$vazne.Add($text) } }
    foreach ($k in $pre.Keys) {
        $a = [string]$pre[$k]; $b = $a; if ($po.Contains($k)) { $b = [string]$po[$k] }
        $v = $null; if ($obn.Contains($k)) { $v = [string]$obn[$k] }
        if ($k -like 'table|*' -and ($a -eq 'ERR' -or $b -eq 'ERR')) { [void]$nevyh.Add("tabuľka " + ($k -replace '^table\|', '') + " sa nedala prečítať v produkcii (chýbajú práva) – nedá sa porovnať"); continue }
        if ($k -like 'table|*' -and $v -eq 'ERR') { Pridaj-Rozdiel $k ("{0}: produkcia '{1}', obnovená tabuľka sa nedala prečítať" -f $k, $a); continue }
        $dobre = $false
        if ($null -ne $v) {
            if ($k -like 'table|*') { $dobre = (([int]$v -ge [math]::Min([int]$a, [int]$b)) -and ([int]$v -le [math]::Max([int]$a, [int]$b))) }
            elseif ($k -like 'seq|*') { $dobre = (Test-Sekvencia $a $b $v) }
            else { $dobre = ($v -eq $a -or $v -eq $b) }
        }
        if ($dobre) { $zhoda++ } else { Pridaj-Rozdiel $k ("{0}: produkcia '{1}', obnovené '{2}'" -f $k, $a, $(if ($null -eq $v) { '(chýba)' } else { $v })) }
    }
    foreach ($k in @($pre.Keys | Where-Object { $_ -like 'table|*' })) {
        $nm = $k -replace '^table\|', ''
        $akt = $null; if ($obObn.Contains("content|$nm")) { $akt = [string]$obObn["content|$nm"]; if ($akt -eq 'ERR') { $akt = $null } }
        $c2 = Porovnaj-Obsah $obPre $obPo $nm $akt
        if ($c2 -eq 'ok') { $zhoda++ }
        elseif ($c2 -eq 'zle') { Pridaj-Rozdiel $nm "OBSAH tabuľky ${nm}: hodnoty v obnovenej databáze sa líšia od produkcie (alebo tabuľka nie je obnovená)" }
        else { [void]$nevyh.Add("obsah tabuľky $nm sa nedal porovnať (menila sa počas zálohy alebo chýba odtlačok)") }
    }
    Zapis-Text (Join-Path $D 'rozdiely_obnovy.txt') ((@($vazne) + @($mensie) + @($nevyh)) -join "`r`n")

    Write-Host ''
    $vysledok = ''
    if ($vazne.Count -gt 0) {
        $vysledok = 'NEUSPESNA'; $koniec = 1
        Write-Host "SKÚŠOBNÁ OBNOVA NEÚSPEŠNÁ: rozdiely v public/objektoch ($($vazne.Count)). Záloha sa nepreukázala ako správne obnoviteľná; migráciu A nespúšťaj." -ForegroundColor Red
        $vazne | Select-Object -First 15 | ForEach-Object { Info $_ }
    } elseif ($neocak.Count -gt 0 -or ($problemObnovy -and $chybLines.Count -eq 0)) {
        $vysledok = 'NEUSPESNA'; $koniec = 1
        Write-Host 'SKÚŠOBNÁ OBNOVA NEÚSPEŠNÁ: pg_restore hlásil chyby, ktoré skript nevie označiť za očakávané lokálne rozdiely (NEVYHODNOTENÉ). Nepovažuj to za úspech; pošli mi chyby_obnovy.txt (bez hesiel).' -ForegroundColor Red
    } elseif ($problemObnovy -or $mensie.Count -gt 0 -or $nevyh.Count -gt 0 -or $zlObn -gt 0 -or $null -ne $obmedzenieStavu) {
        $vysledok = 'NEUPLNE_OVERENY'; $koniec = 2
        Write-Host 'SKÚŠOBNÁ OBNOVA: NEÚPLNE OVERENÝ (nie je to úspešná úplná obnova). Dôvody:' -ForegroundColor Yellow
        if ($problemObnovy) { Info ("- pg_restore skončil s kódom {0} a {1} hláseniami, všetky sú očakávané rozdiely lokálny PostgreSQL vs Supabase (chyby_obnovy.txt)" -f $rs.Code, $chybLines.Count) }
        if ($mensie.Count -gt 0) { Info "- rozdiely v auth/storage: $($mensie.Count)"; $mensie | Select-Object -First 8 | ForEach-Object { Info ("    " + $_) } }
        if ($nevyh.Count -gt 0) { Info "- $($nevyh.Count) tabuliek sa nedalo porovnať (menili sa počas zálohy / chýba odtlačok); zopakuj zálohu, keď nikto nehrá" }
        if ($zlObn -gt 0) { Info "- odtlačok obsahu zlyhal pri $zlObn tabuľkách" }
        if ($null -ne $obmedzenieStavu) { Info "- $obmedzenieStavu" }
    } else {
        $vysledok = 'ZHODA'
        Write-Host "SKÚŠOBNÁ OBNOVA: ÚPLNÁ ZHODA ($zhoda kontrol). pg_restore bez chýb, počty riadkov aj hodnoty všetkých tabuliek, sekvencie, funkcie, triggery, politiky RLS, indexy, obmedzenia a práva (schémy public, auth, storage) sedia s produkciou v čase zálohy." -ForegroundColor Green
    }
    Zapis-Text (Join-Path $D 'VYSLEDOK_OBNOVY.txt') ("VYSLEDOK=$vysledok`r`nSTAV_ZALOHY=$stavZalohy`r`nPG_RESTORE_KOD=$($rs.Code)`r`nCHYBY_OCAKAVANE=$($ocak.Count)`r`nCHYBY_NEVYHODNOTENE=$($neocak.Count)`r`nROZDIELY_PUBLIC=$($vazne.Count)`r`nROZDIELY_AUTH_STORAGE=$($mensie.Count)`r`nNEOVERITELNE=$($nevyh.Count)`r`nDATUM=$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')`r`n")
    Info "Podrobnosti: $(Join-Path $D 'rozdiely_obnovy.txt')"

    Write-Host ''
    $odp = Read-Host "Zmazať skúšobnú databázu $testDb z TVOJHO lokálneho servera? (a/N)"
    if ($odp -match '^[aAyY]') {
        if ($testDb -match '^zaloha_test_\d{8}_\d{6}$') {
            $dd = Invoke-Pg $t.Psql ($conn + @('-X', '-q', '-c', "drop database $testDb"))
            if ($dd.Code -eq 0) { Ok "skúšobná databáza $testDb zmazaná"; $testDb = $null } else { Varuj ("nepodarilo sa zmazať: " + $dd.Err.Trim()) }
        }
    }
    if ($testDb) { Info "Skúšobná databáza $testDb ostala na lokálnom serveri. Zmaž ju neskôr (pgAdmin alebo: DROP DATABASE $testDb;)." }
} catch {
    Chyba (Mask-Text $_.Exception.Message); $koniec = 1
} finally {
    Clear-Heslo
}
exit $koniec
