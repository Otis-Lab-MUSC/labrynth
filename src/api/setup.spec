# -*- mode: python ; coding: utf-8 -*-

import sys

block_cipher = None

a = Analysis(
    ['app.py'],
    pathex=['.'], 
    binaries=[],
    datas=[],
    hiddenimports=['flask', 'socket', 'json', 'uuid', 'signal', 'threading'],
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

if sys.platform == 'darwin':
    exe = EXE(
        pyz,
        a.scripts,
        [],
        exclude_binaries=True,
        name='reacher-api',
        debug=False,
        bootloader_ignore_signals=False,
        strip=False,
        upx=True,
        console=True,
    )
    app = BUNDLE(
        exe,
        a.binaries,
        a.zipfiles,
        a.datas,
        name='REACHER API.app',
        bundle_identifier='com.yourname.reacher-dashboard',
    )
else:
    try:
        exe = EXE(
            pyz,
            a.scripts,
            [],
            exclude_binaries=True,
            name='reacher-api',
            debug=False,
            bootloader_ignore_signals=False,
            strip=False,
            upx=True,
            console=True,
        )
    except:
        exe = EXE(
            pyz,
            a.scripts,
            [],
            exclude_binaries=True,
            name='reacher-api',
            debug=False,
            bootloader_ignore_signals=False,
            strip=False,
            upx=True,
            console=True,
        )
    finally:
        coll = COLLECT(
            exe,
            a.binaries,
            a.zipfiles,
            a.datas,
            strip=False,
            upx=True,
            upx_exclude=[],
            name='reacher-api',
        )