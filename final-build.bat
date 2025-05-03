@echo off
setlocal

echo ESP32 Bluetooth App - Final Build Script
echo ======================================
echo.

:: Set up environment
echo Setting up environment...
cd /d %~dp0

:: Fix gradle.properties - remove trailing spaces
echo Fixing gradle.properties...
(
  echo org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
  echo android.useAndroidX=true
  echo android.enableJetifier=true
  echo hermesEnabled=true
) > android\gradle.properties
echo Done.

:: Set SDK path
echo Setting Android SDK path...
echo sdk.dir=C:/Users/rahul/AppData/Local/Android/Sdk> android\local.properties
echo Done.

:: Ask for Java path
echo.
echo Please enter the full path to your JDK installation:
echo Example: C:\Program Files\Eclipse Adoptium\jdk-21.0.6+7
echo.
set /p USER_JDK="> "

if not exist "%USER_JDK%\bin\java.exe" (
  echo ERROR: Java not found at the specified location.
  echo Please verify the path and make sure it contains bin\java.exe
  pause
  exit /b 1
)

:: Set JAVA_HOME
echo.
echo Setting JAVA_HOME to: %USER_JDK%
set "JAVA_HOME=%USER_JDK%"

:: Verify Java works
echo.
echo Testing Java...
"%JAVA_HOME%\bin\java" -version
if %ERRORLEVEL% NEQ 0 (
  echo Java test failed! Please check your JDK installation.
  pause
  exit /b 1
)
echo Java test successful.
echo.

:: Run Gradle
echo Building the app...
cd android
call gradlew clean
call gradlew assembleRelease --stacktrace

if %ERRORLEVEL% NEQ 0 (
  echo.
  echo Build failed. Please check the error messages above.
  pause
  exit /b 1
)

echo.
echo Build successful!
echo.
echo Your APK is located at:
echo %~dp0android\app\build\outputs\apk\release\app-release.apk
echo.
echo Copy this file to your Android device and install it.
echo.
pause

endlocal