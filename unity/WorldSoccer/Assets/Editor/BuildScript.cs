using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace WorldSoccer.EditorTools
{
    /// <summary>
    /// Build sem editor aberto (GitHub Actions / GameCI):
    /// cria a cena de boot com o objeto Boot, configura o Android e gera o APK.
    /// Uso: -executeMethod WorldSoccer.EditorTools.BuildScript.BuildAndroid
    /// </summary>
    public static class BuildScript
    {
        const string ScenePath = "Assets/Scenes/Boot.unity";

        [MenuItem("World Soccer/Criar cena de boot")]
        public static void EnsureBootScene()
        {
            Directory.CreateDirectory("Assets/Scenes");
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var cam = new GameObject("Main Camera");
            var c = cam.AddComponent<Camera>();
            c.orthographic = true;
            c.clearFlags = CameraClearFlags.SolidColor;
            c.backgroundColor = new Color(0.04f, 0.05f, 0.05f);
            cam.tag = "MainCamera";
            var boot = new GameObject("Boot");
            boot.AddComponent<WorldSoccer.Core.Boot>();
            EditorSceneManager.SaveScene(scene, ScenePath);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
        }

        static void ConfigureAndroid()
        {
            PlayerSettings.companyName = "Alves";
            PlayerSettings.productName = "World Soccer: A Nova Era";
            PlayerSettings.SetApplicationIdentifier(BuildTargetGroup.Android, "com.alves.worldsoccerera");
            PlayerSettings.Android.minSdkVersion = AndroidSdkVersions.AndroidApiLevel24;
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;
            PlayerSettings.SetScriptingBackend(BuildTargetGroup.Android, ScriptingImplementation.IL2CPP);
            PlayerSettings.defaultInterfaceOrientation = UIOrientation.AutoRotation;
            PlayerSettings.allowedAutorotateToPortrait = false;
            PlayerSettings.allowedAutorotateToPortraitUpsideDown = false;
            PlayerSettings.allowedAutorotateToLandscapeLeft = true;
            PlayerSettings.allowedAutorotateToLandscapeRight = true;
            PlayerSettings.Android.blitType = AndroidBlitType.Never;
            PlayerSettings.colorSpace = ColorSpace.Gamma;
            PlayerSettings.SetGraphicsAPIs(BuildTarget.Android, new[] { UnityEngine.Rendering.GraphicsDeviceType.OpenGLES3 });
            EditorUserBuildSettings.buildAppBundle = false;
        }

        public static void BuildAndroid()
        {
            EnsureBootScene();
            ConfigureAndroid();
            string outDir = System.Environment.GetEnvironmentVariable("BUILD_OUT") ?? "Builds/Android";
            Directory.CreateDirectory(outDir);
            var opts = new BuildPlayerOptions
            {
                scenes = new[] { ScenePath },
                locationPathName = Path.Combine(outDir, "world-soccer.apk"),
                target = BuildTarget.Android,
                options = BuildOptions.None,
            };
            var report = BuildPipeline.BuildPlayer(opts);
            Debug.Log("BUILD RESULT: " + report.summary.result + " size=" + report.summary.totalSize);
            if (report.summary.result != UnityEditor.Build.Reporting.BuildResult.Succeeded)
                EditorApplication.Exit(1);
        }
    }
}
