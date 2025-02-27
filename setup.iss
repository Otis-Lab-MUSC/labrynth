[Setup]
AppName=REACHER Suite
AppVersion=1.0
DefaultDirName={autopf}\REACHER Suite
OutputDir=dist
OutputBaseFilename=reacher_suite_setup
Compression=lzma
SolidCompression=yes

[Files]
Source: "dist\reacher_suite.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\REACHER Suite"; Filename: "{app}\reacher_suite.exe"
Name: "{autodesktop}\REACHER Suite"; Filename: "{app}\reacher_suite.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"