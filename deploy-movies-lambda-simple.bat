@echo off
echo ========================================
echo Desplegando Lambda de Peliculas
echo ========================================
echo.

cd infrastructure

echo [1/2] Compilando TypeScript...
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: Compilacion fallida
    pause
    exit /b 1
)
echo OK: Compilacion exitosa
echo.

echo [2/2] Desplegando a AWS...
call npm run deploy -- --require-approval never
if %errorlevel% neq 0 (
    echo ERROR: Despliegue fallido
    pause
    exit /b 1
)
echo OK: Despliegue exitoso
echo.

cd ..

echo ========================================
echo DESPLIEGUE COMPLETADO
echo ========================================
echo.
echo La Lambda de peliculas ha sido actualizada con:
echo - Soporte para paginacion (parametro page)
echo - Devuelve todas las peliculas de cada pagina
echo - Cache por pagina para mejor rendimiento
echo.
pause
