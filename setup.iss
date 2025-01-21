; Define the application name, version, and other metadata
[Setup]
AppName=REACHER Suite
AppVersion=1.0.0
DefaultDirName={commonpf}\REACHER
DefaultGroupName=REACHER
OutputDir=output
OutputBaseFilename=REACHER_Installer
Compression=lzma
SolidCompression=yes

; Define the files to be included in the installer
[Files]
Source: "C:\Users\jboqu\OneDrive\Desktop\REACHER\dashboard\dist\REACHER\*"; DestDir: "{app}\dashboard"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "C:\Users\jboqu\OneDrive\Desktop\REACHER\api\reacher_api\*"; DestDir: "{app}\api"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "C:\Users\jboqu\OneDrive\Desktop\REACHER\dashboard\utils\assets\reacher-app-icon.ico"; DestDir: "{app}"; Flags: ignoreversion

; Define the icons to be created in the Start Menu and Desktop
[Icons]
Name: "{group}\REACHER Dashboard"; Filename: "{app}\dashboard\REACHER_Dashboard.exe"; WorkingDir: "{app}\dashboard"; IconFilename: "{app}\reacher-app-icon.ico"
Name: "{group}\REACHER API"; Filename: "{app}\venv\Scripts\pythonw.exe"; Parameters: """{app}\api\app.py"""; WorkingDir: "{app}\api"
Name: "{group}\REACHER Service"; Filename: "{app}\venv\Scripts\pythonw.exe"; Parameters: """{app}\service\service.py"""; WorkingDir: "{app}\service"
Name: "{commondesktop}\REACHER"; Filename: "{app}\dashboard\REACHER.exe"; WorkingDir: "{app}\dashboard"; IconFilename: "{app}\reacher-app-icon.ico"; Tasks: desktopicon

; Define the tasks to be performed during installation
[Tasks]
Name: "desktopicon"; Description: "Create a &desktop icon"; GroupDescription: "Additional icons:"; Flags: unchecked

; Define the uninstaller settings
[UninstallDelete]
Type: filesandordirs; Name: "{app}"
