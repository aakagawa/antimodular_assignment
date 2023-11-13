const video = document.getElementById('webcam');

const constraints = {
    video: {
        width: { ideal: 1280 },
        height: { ideal: 720 }
    }
};  

navigator.mediaDevices.getUserMedia(constraints).then(stream => {
    const video = document.getElementById('webcam');
    video.srcObject = stream;
}).catch(err => {
    console.error("Error starting webcam:", err);
});

const resultsTable = document.getElementById('results');

// Convert to grayscale
function convertToGrayscale(context, imageData) {
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        data[i] = avg;
        data[i + 1] = avg;
        data[i + 2] = avg;
    }
    context.putImageData(imageData, 0, 0);
}

// Normalize brightness
function normalizeBrightness(context, imageData) {
    const data = imageData.data;
    const targetBrightness = 128;
    let totalBrightness = 0;
    // Calculate average brightness
    for (let i = 0; i < data.length; i += 4) {
        totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
    }
    const averageBrightness = totalBrightness / (data.length / 4);
    // Calculate adjustment factor
    const adjustmentFactor = targetBrightness / averageBrightness;
    // Adjust each pixel
    for (let i = 0; i < data.length; i += 4) {
        data[i] *= adjustmentFactor;
        data[i + 1] *= adjustmentFactor;
        data[i + 2] *= adjustmentFactor;
    }
    context.putImageData(imageData, 0, 0);
}

// Adjust contrast
function adjustContrast(context, imageData) {
    // contrastFactor, threshold
    const contrastFactor = 3; // Adjust this value to change the contrast
    const threshold = 96; // Adjust this value to change the threshold

    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        // Apply contrast enhancement formula
        data[i] = contrastFactor * (data[i] - threshold) + threshold;
        data[i + 1] = contrastFactor * (data[i + 1] - threshold) + threshold;
        data[i + 2] = contrastFactor * (data[i + 2] - threshold) + threshold;
    }
    context.putImageData(imageData, 0, 0);
}

video.addEventListener('loadeddata', () => {
    const width = video.videoWidth;
    const height = video.videoHeight;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    canvas.width = width;
    canvas.height = height;

    const imageCaptureInterval = 3000; // Capture every 3 seconds
    const confidenceThreshold = 68;
    const boundingBoxExtensionFactor = 1.11;

    setInterval(() => {
        context.drawImage(video, 0, 0, width, height);
        const imageData = context.getImageData(0, 0, width, height);

        // Convert the captured frame to grayscale
        convertToGrayscale(context, imageData);

        // Normalize brightness
        normalizeBrightness(context, imageData); 

        // Increase contrast
        adjustContrast(context, imageData);

        // Perform OCR on the grayscale image
        Tesseract.recognize(
            canvas.toDataURL(),
            'eng',
            {
                logger: m => console.log(m),
                psm: 6
            }
        ).then(result => {
            // Extract subsections of the image where text is detected
            if (result && result.data && result.data.words) {
                const words = result.data.words;

                // Clear previous results
                resultsTable.querySelectorAll('tr:not(:first-child)').forEach(row => row.remove());

                words.forEach(word => {
                    // Check confidence
                    if (word.confidence >= confidenceThreshold && word.text.length > 1) {
                        const { x0, y0, x1, y1 } = word.bbox;

                        // Extend bounding box dimensions
                        const extendedX0 = Math.max(0, x0 - (x1 - x0) * (boundingBoxExtensionFactor - 1) / 2);
                        const extendedY0 = Math.max(0, y0 - (y1 - y0) * (boundingBoxExtensionFactor - 1) / 2);
                        const extendedX1 = Math.min(width, x1 + (x1 - x0) * (boundingBoxExtensionFactor - 1) / 2);
                        const extendedY1 = Math.min(height, y1 + (y1 - y0) * (boundingBoxExtensionFactor - 1) / 2);

                        // Extract subsection of the image
                        const croppedCanvas = document.createElement('canvas');
                        croppedCanvas.width = extendedX1 - extendedX0;
                        croppedCanvas.height = extendedY1 - extendedY0;
                        const croppedContext = croppedCanvas.getContext('2d');
                        croppedContext.drawImage(canvas, extendedX0, extendedY0, extendedX1 - extendedX0, extendedY1 - extendedY0, 0, 0, extendedX1 - extendedX0, extendedY1 - extendedY0);

                        // Display subsections on the screen
                        const newRow = resultsTable.insertRow();
                        const cellImage = newRow.insertCell(0);
                        const cellText = newRow.insertCell(1);

                        // Set a fixed height for the image element
                        const fixedImageHeight = 16; // Set your desired height
                        cellImage.innerHTML = `<img src="${croppedCanvas.toDataURL()}" height="${fixedImageHeight}"px />`;
                        cellText.textContent = word.text;
                    }
                });
            }
        }).catch(error => {
            console.error("Error during text recognition:", error);
        });
    }, imageCaptureInterval);
});