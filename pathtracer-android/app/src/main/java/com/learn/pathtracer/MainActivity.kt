package com.learn.pathtracer

import android.os.Bundle
import android.view.View
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.*

class MainActivity : AppCompatActivity() {

    private lateinit var imageView: ImageView
    private lateinit var progressBar: ProgressBar
    private lateinit var progressText: TextView
    private lateinit var renderButton: Button
    private lateinit var qualityGroup: RadioGroup

    private var renderJob: Job? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        imageView    = findViewById(R.id.imageView)
        progressBar  = findViewById(R.id.progressBar)
        progressText = findViewById(R.id.progressText)
        renderButton = findViewById(R.id.renderButton)
        qualityGroup = findViewById(R.id.qualityGroup)

        renderButton.setOnClickListener { startRender() }
    }

    private fun startRender() {
        // Отменяем предыдущий рендер если был
        renderJob?.cancel()

        val (samples, label) = when (qualityGroup.checkedRadioButtonId) {
            R.id.radioFast   -> Pair(4,   "Быстро (4 spp)")
            R.id.radioMedium -> Pair(16,  "Среднее (16 spp)")
            R.id.radioHigh   -> Pair(64,  "Высокое (64 spp)")
            else             -> Pair(4,   "Быстро (4 spp)")
        }

        // Размер рендера: меньше = быстрее (для обучения хватит 320x240)
        val width  = 480
        val height = 270

        renderButton.isEnabled = false
        renderButton.text = "Рендерится..."
        progressBar.visibility = View.VISIBLE
        progressBar.progress = 0

        renderJob = lifecycleScope.launch {
            val bitmap = PathTracer.render(
                width          = width,
                height         = height,
                samplesPerPixel = samples,
                maxDepth       = 8,
                onProgress     = { bmp, percent ->
                    // Обновляем картинку прямо во время рендера!
                    imageView.setImageBitmap(bmp.copy(bmp.config, false))
                    progressBar.progress = percent
                    progressText.text = "$label — $percent%"
                }
            )

            // Финальное обновление
            imageView.setImageBitmap(bitmap)
            progressBar.visibility = View.GONE
            progressText.text = "$label — готово!"
            renderButton.isEnabled = true
            renderButton.text = "Рендерить"
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        renderJob?.cancel()
    }
}
