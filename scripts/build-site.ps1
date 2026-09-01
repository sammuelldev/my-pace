$ErrorActionPreference = "Stop"

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$distRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot "dist"))

if (-not $distRoot.StartsWith($projectRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "O diretório de saída precisa permanecer dentro do projeto."
}

if (Test-Path -LiteralPath $distRoot) {
  Remove-Item -LiteralPath $distRoot -Recurse -Force
}

$clientRoot = Join-Path $distRoot "client"
$serverRoot = Join-Path $distRoot "server"
New-Item -ItemType Directory -Path $clientRoot, $serverRoot -Force | Out-Null

Copy-Item -LiteralPath (Join-Path $projectRoot "index.html") -Destination $clientRoot
Copy-Item -LiteralPath (Join-Path $projectRoot "assets") -Destination $clientRoot -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot "css") -Destination $clientRoot -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot "js") -Destination $clientRoot -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot "server\index.js") -Destination (Join-Path $serverRoot "index.js")

Write-Output "Build concluído em $distRoot"
