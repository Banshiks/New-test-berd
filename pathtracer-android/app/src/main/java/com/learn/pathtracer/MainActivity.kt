package com.learn.pathtracer

import android.os.Bundle
import android.view.View
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.*

// ─────────────────────────────────────────────
// MainActivity — UI для progressive path tracer'а.
//
// UX: нажимаем "Старт" → рендер начинается.
//   Картинка обновляется после каждого сэмпла.
//   Счётчик показывает сколько сэмплов накоплено.
//   "Стоп" → рендер останавливается (coroutine cancel).
//   "Старт" снова → сброс аккумулятора, новый рендер.
// ─────────────────────────────────────────────
class MainActivity : AppCompatActivity() {

    private lateinit var imageView: ImageView
    private lateinit var progressText: TextView
    private lateinit var startButton: Button
    private lateinit var stopButton: Button
    private lateinit var sizeGroup: RadioGroup

    private var renderJob: Job? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        imageView    = findViewById(R.id.imageView)
        progressText = findViewById(R.id.progressText)
        startButton  = findViewById(R.id.startButton)
        stopButton   = findViewById(R.id.stopButton)
        sizeGroup    = findViewById(R.id.sizeGroup)

        startButton.setOnClickListener { startRender() }
        stopButton.setOnClickListener  { stopRender()  }

        stopButton.isEnabled = false
        progressText.text = "Cornell Box Path Tracer"
    }

    private fun startRender() {
        renderJob?.cancel()

        val (width, height) = when (sizeGroup.checkedRadioButtonId) {
            R.id.radioSmall  -> Pair(240, 240)
            R.id.radioMedium -> Pair(400, 400)
            R.id.radioLarge  -> Pair(600, 600)
            else             -> Pair(240, 240)
        }

        startButton.isEnabled = false
        stopButton.isEnabled  = true
        progressText.text = "Рендеринг..."

        renderJob = lifecycleScope.launch {
            PathTracer.renderProgressive(
                width    = width,
                height   = height,
                maxDepth = 12,
                onSample = { bitmap, sampleCount ->
                    imageView.setImageBitmap(bitmap)
                    progressText.text = "Сэмплов: $sampleCount  |  ${width}×${height}"
                }
            )
            // Сюда попадаем только при cancel (кнопка Стоп)
            progressText.text = "${progressText.text}  — остановлено"
            startButton.isEnabled = true
            stopButton.isEnabled  = false
        }
    }

    private fun stopRender() {
        renderJob?.cancel()
        startButton.isEnabled = true
        stopButton.isEnabled  = false
    }

    override fun onDestroy() {
        super.onDestroy()
        renderJob?.cancel()
    }
}
