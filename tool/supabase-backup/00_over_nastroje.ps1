# KONTROLA NÁSTROJOV – nič sa nepripája na internet ani na databázu, nepýta heslo, nič nemení.
. (Join-Path (Join-Path $PSScriptRoot 'lib') '_spolocne.ps1')
$problem = 0
try {
    Nadpis 'Kontrola nástrojov pre zálohu databázy'
    Info ("Windows PowerShell: {0}" -f $PSVersionTable.PSVersion)
    $tools = @(Find-PgTools)
    if ($tools.Count -eq 0) {
        Chyba 'Nenašiel som pg_dump, pg_restore a psql. Nainštaluj PostgreSQL podľa NAVOD (kapitola 2) a spusti tento skript znova.'
        $problem = 1
    } else {
        foreach ($t in $tools) { Ok ("PostgreSQL nástroje verzie {0} v: {1}" -f $t.Major, $t.Bin) }
        $best = $tools[0]
        Info ("Pri zálohe sa použije najnovšia nájdená verzia ({0}). Skript 01 si presne porovná verziu nástrojov s verziou tvojej databázy a zastaví sa, ak je nástroj starší." -f $best.Major)
        Info 'Tvoja produkčná databáza je zvyčajne PostgreSQL 15 alebo 17. Nástroje musia mať rovnakú alebo NOVŠIU verziu.'
        if ($best.Major -lt 17) { Varuj ("Najnovšia nájdená verzia je {0}. Ak má tvoja databáza verziu 17, bude treba nainštalovať novšie nástroje." -f $best.Major) }
    }
    Nadpis 'Miesto na zálohy'
    $koren = Get-KorenZaloh
    try { $f = Test-MiestoZalohy $koren; Ok "Záloha sa uloží do: $f (mimo Git repozitára a mimo cloudu)" }
    catch { Chyba $_.Exception.Message; $problem = 1 }
    if ($script:JeWindows) {
        $drv = Get-PSDrive -Name ([IO.Path]::GetPathRoot([IO.Path]::GetFullPath($koren)).Substring(0, 1)) -ErrorAction SilentlyContinue
        if ($drv) { Info ("Voľné miesto na disku: {0:N1} GB (stačí niekoľko stoviek MB)" -f ($drv.Free / 1GB)) }
    }
    Nadpis 'Voliteľné: lokálny PostgreSQL server (na skúšobnú obnovu, skript 03)'
    $srv = $false
    if ($tools.Count -gt 0) { foreach ($t in $tools) { if (Test-Path (Join-Path $t.Bin ('pg_ctl' + $(if ($script:JeWindows) { '.exe' } else { '' })))) { $srv = $true } } }
    if ($script:JeWindows) { $sl = @(Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue); if ($sl.Count -gt 0) { $srv = $true; foreach ($s in $sl) { Info ("Služba: {0} ({1})" -f $s.Name, $s.Status) } } }
    if ($srv) { Ok 'Lokálny PostgreSQL server je nainštalovaný (skúšobná obnova 03 bude možná).' }
    else { Varuj 'Lokálny server nenájdený. Na ZÁLOHU a jej overenie (01, 02) nie je potrebný; na skúšobnú obnovu (03) áno.' }
    Write-Host ''
    if ($problem -eq 0) { Write-Host 'VÝSLEDOK: nástroje na zálohu sú v poriadku.' -ForegroundColor Green } else { Write-Host 'VÝSLEDOK: niečo chýba – pozri vyššie a NAVOD.' -ForegroundColor Red }
} catch { Chyba (Mask-Text $_.Exception.Message); $problem = 1 }
exit $problem
