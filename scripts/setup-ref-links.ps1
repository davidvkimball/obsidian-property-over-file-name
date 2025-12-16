# Setup script to create symlinks to the 6 core Obsidian projects
# Run this from anywhere: .\scripts\setup-ref-links.ps1

# Change to project root (parent of scripts folder)
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptPath
Set-Location $projectRoot

Write-Host "Setting up symlinks to core Obsidian projects..." -ForegroundColor Cyan

# Central .ref location (one level up from project)
$parentDir = Split-Path -Parent $projectRoot
$centralRefRoot = Join-Path $parentDir ".ref"
$centralRef = Join-Path $centralRefRoot "obsidian-dev"

# Create central .ref root if it doesn't exist
if (-not (Test-Path $centralRefRoot)) {
    New-Item -ItemType Directory -Path $centralRefRoot | Out-Null
    Write-Host "Created central .ref directory" -ForegroundColor Green
}

# Create obsidian-dev subfolder if it doesn't exist
if (-not (Test-Path $centralRef)) {
    New-Item -ItemType Directory -Path $centralRef | Out-Null
    Write-Host "Created obsidian-dev subfolder" -ForegroundColor Green
}

# Ensure plugins and themes folders exist
$pluginsDir = Join-Path $centralRef "plugins"
$themesDir = Join-Path $centralRef "themes"
if (-not (Test-Path $pluginsDir)) {
    New-Item -ItemType Directory -Path $pluginsDir | Out-Null
}
if (-not (Test-Path $themesDir)) {
    New-Item -ItemType Directory -Path $themesDir | Out-Null
}

# Define the 6 core projects and their URLs
$coreProjects = @{
    "obsidian-api" = "https://github.com/obsidianmd/obsidian-api.git"
    "obsidian-sample-plugin" = "https://github.com/obsidianmd/obsidian-sample-plugin.git"
    "obsidian-developer-docs" = "https://github.com/obsidianmd/obsidian-developer-docs.git"
    "obsidian-plugin-docs" = "https://github.com/obsidianmd/obsidian-plugin-docs.git"
    "obsidian-sample-theme" = "https://github.com/obsidianmd/obsidian-sample-theme.git"
    "eslint-plugin" = "https://github.com/obsidianmd/eslint-plugin.git"
}

# Clone repos if they don't exist, or pull latest if they do
foreach ($project in $coreProjects.Keys) {
    $projectPath = Join-Path $centralRef $project
    if (-not (Test-Path $projectPath)) {
        Write-Host "Cloning $project..." -ForegroundColor Yellow
        Push-Location $centralRef
        git clone $coreProjects[$project] $project
        Pop-Location
    } else {
        # Repo exists, pull latest changes
        Write-Host "Updating $project..." -ForegroundColor Yellow
        Push-Location $projectPath
        git pull
        Pop-Location
    }
}

# Ensure project .ref directory exists
if (-not (Test-Path ".ref")) {
    New-Item -ItemType Directory -Path ".ref" | Out-Null
    Write-Host "Created .ref directory" -ForegroundColor Green
}

$globalRefPath = $centralRef

# Create symlinks for each core project
foreach ($project in $coreProjects.Keys) {
    $linkPath = ".ref\$project"
    $targetPath = Join-Path $globalRefPath $project
    
    # Check if target exists
    if (-not (Test-Path $targetPath)) {
        Write-Host "WARNING: Target not found: $targetPath" -ForegroundColor Yellow
        Write-Host "  Skipping $project" -ForegroundColor Yellow
        continue
    }
    
    # Remove existing link if it exists
    if (Test-Path $linkPath) {
        Remove-Item $linkPath -Force -ErrorAction SilentlyContinue
    }
    
    # Create junction (symlink for directories on Windows)
    try {
        New-Item -ItemType Junction -Path $linkPath -Target $targetPath -Force | Out-Null
        Write-Host "✓ Created symlink: $linkPath -> $targetPath" -ForegroundColor Green
    }
    catch {
        Write-Host "ERROR creating symlink for $project : $_" -ForegroundColor Red
        Write-Host "  You may need to run PowerShell as Administrator or enable Developer Mode" -ForegroundColor Yellow
    }
}

Write-Host "`nSetup complete!" -ForegroundColor Cyan
Write-Host "Verifying symlinks..." -ForegroundColor Cyan

# Verify symlinks
foreach ($project in $coreProjects.Keys) {
    $linkPath = ".ref\$project"
    if (Test-Path $linkPath) {
        $item = Get-Item $linkPath
        if ($item.LinkType -eq "Junction" -or $item.LinkType -eq "SymbolicLink") {
            Write-Host "✓ $project : $($item.LinkType)" -ForegroundColor Green
        } else {
            Write-Host "✗ $project : Not a symlink (may be a regular directory)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "✗ $project : Missing" -ForegroundColor Red
    }
}

