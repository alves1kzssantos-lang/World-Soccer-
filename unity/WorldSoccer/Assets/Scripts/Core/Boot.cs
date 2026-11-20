using UnityEngine;

namespace WorldSoccer.Core
{
    /// <summary>Ponto de entrada: criado pela cena de boot.</summary>
    public sealed class Boot : MonoBehaviour
    {
        void Awake()
        {
            Application.targetFrameRate = 60;
            QualitySettings.vSyncCount = 0;
            Screen.sleepTimeout = SleepTimeout.NeverSleep;
        }
    }
}
