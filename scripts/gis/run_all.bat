@echo off
rem Runs the full Phase 1 pipeline with the Python bundled in QGIS.
rem Override QGIS_BIN if QGIS is installed elsewhere.
if "%QGIS_BIN%"=="" set "QGIS_BIN=C:\Program Files\QGIS 4.2.3\bin"
pushd "%~dp0"
call "%QGIS_BIN%\python-qgis.bat" inspect_data.py    || goto :err
call "%QGIS_BIN%\python-qgis.bat" process_terrain.py || goto :err
call "%QGIS_BIN%\python-qgis.bat" export_web_data.py || goto :err
call "%QGIS_BIN%\python-qgis.bat" validate_outputs.py || goto :err
popd
exit /b 0
:err
popd
echo Pipeline failed.
exit /b 1
