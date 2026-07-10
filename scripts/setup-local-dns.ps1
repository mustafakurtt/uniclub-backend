<#
.SYNOPSIS
  uniclub.test / test.uniclub.test isimlerini çözümler ve Caddy'nin yerel
  kök sertifikasını güvenilir depoya kurar.

.DESCRIPTION
  YÖNETİCİ olarak açılmış bir PowerShell'de çalıştır.

  Production makinesinde (laptop):
      .\scripts\setup-local-dns.ps1

  Geliştirme makinesinde (masaüstü), laptop'un LAN IP'siyle:
      .\scripts\setup-local-dns.ps1 -IPAddress 192.168.1.42 -CertPath .\deploy\ca\caddy-local-root.crt

  Idempotenttir: birden çok kez çalıştırmak güvenlidir.

.PARAMETER IPAddress
  İsimlerin çözümleneceği adres. Varsayılan 127.0.0.1 (yalnızca bu makine).

.PARAMETER CertPath
  Caddy'nin kök sertifikası. Verilmezse sertifika adımı atlanır.
  Çıkarmak için:  docker cp uniclub_proxy:/data/caddy/pki/authorities/local/root.crt .\deploy\ca\caddy-local-root.crt

.PARAMETER Remove
  Eklenen hosts girdilerini kaldırır.
#>
param(
  [string]$IPAddress = "127.0.0.1",
  [string]$CertPath,
  [switch]$Remove
)

$ErrorActionPreference = "Stop"

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Error "Bu script YÖNETİCİ olarak çalıştırılmalı (hosts dosyası ve sertifika deposu)."
  exit 1
}

$hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
$marker = "# uniclub"
$names = @("uniclub.test", "test.uniclub.test")

# ── hosts ────────────────────────────────────────────────────
# Kendi eklediğimiz satırları marker ile işaretliyoruz ki temiz kaldırabilelim.
#
# Satırları elle CRLF ile birleştirip WriteAllText kullanıyoruz. Set-Content'e
# dizi vermek, dosyanın son satırında newline yoksa girdileri yan yana yapıştırıp
# "# uniclub127.0.0.1  test.uniclub.test" gibi bozuk bir satır üretebiliyor —
# ve o isim artık çözümlenmiyor.
$kept = @(Get-Content $hostsPath -ErrorAction SilentlyContinue |
  Where-Object { $_ -notmatch [regex]::Escape($marker) })

# Sondaki boş satırları at; kendimiz tek bir newline ile bitireceğiz.
while ($kept.Count -gt 0 -and [string]::IsNullOrWhiteSpace($kept[-1])) {
  $kept = $kept[0..($kept.Count - 2)]
}

if ($Remove) {
  $out = $kept
  Write-Host "hosts girdileri kaldirildi." -ForegroundColor Yellow
} else {
  $out = $kept + ($names | ForEach-Object { "$IPAddress`t$_`t$marker" })
  Write-Host "hosts guncellendi -> $IPAddress" -ForegroundColor Green
  $names | ForEach-Object { Write-Host "  $_" }
}

[IO.File]::WriteAllText($hostsPath, (($out -join "`r`n") + "`r`n"), [Text.Encoding]::ASCII)

ipconfig /flushdns | Out-Null

# ── Kök sertifika ────────────────────────────────────────────
# Caddy kendi CA'sini uretir; tarayicinin ona guvenmesi icin kok sertifika
# "Trusted Root Certification Authorities" deposuna girmeli. Yalnizca bu
# CA'nin imzaladigi sertifikalar guvenilir olur - genel bir zafiyet degildir,
# ama CA'nin ozel anahtari (caddy_data volume) sizarsa o makine icin ciddidir.
if ($CertPath -and -not $Remove) {
  if (-not (Test-Path $CertPath)) {
    Write-Error "Sertifika bulunamadi: $CertPath"
    exit 1
  }
  $cert = Import-Certificate -FilePath $CertPath -CertStoreLocation Cert:\LocalMachine\Root
  Write-Host "Kok sertifika kuruldu: $($cert.Subject)" -ForegroundColor Green
} elseif (-not $Remove) {
  Write-Host "Sertifika adimi atlandi (-CertPath verilmedi). Tarayici uyari verecek." -ForegroundColor Yellow
}

if (-not $Remove) {
  Write-Host ""
  Write-Host "Dogrula:" -ForegroundColor Cyan
  Write-Host "  curl.exe https://uniclub.test/health"
  Write-Host "  curl.exe https://test.uniclub.test/health"
}
