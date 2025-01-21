# -*- mode: python ; coding: utf-8 -*-

block_cipher = None

a = Analysis(
    ['main.py'],  # Entry-point script
    pathex=['.'],  # Add current directory to path
    binaries=[],
    datas=[
        # Include external assets
        ('utils/assets/reacher-app-icon.png', 'utils/assets'), 
        ('utils/assets/reacher-app-icon.ico', 'utils/assets'),
        ('utils/assets/reacher-icon.ico', 'utils/assets'),
        ('utils/assets/reacher-icon.png', 'utils/assets'), 
        ('utils/assets/mouse_still.jpg', 'assets'),
        ('utils/assets/mouse.gif', 'assets')
    ],
    hiddenimports=['panel', 'plotly', 'pkg_resources'],
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='REACHER',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    icon='utils/assets/reacher-app-icon.ico', 
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='REACHER',
)
