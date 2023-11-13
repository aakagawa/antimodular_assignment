navigator.mediaDevices.getUserMedia({ video: true })
    .then(stream => {
        const video = document.getElementById('webcam');
        video.srcObject = stream;
    })
    .catch(err => {
        console.error("Error starting video stream:", err);
    });

const video = document.getElementById('webcam');
const resultsTable = document.getElementById('results');

// Add table headers once
const headerRow = resultsTable.insertRow();
const headerCellImage = headerRow.insertCell(0);
const headerCellText = headerRow.insertCell(1);
headerCellImage.textContent = "Cropped Image";
headerCellText.textContent = "Text";

video.addEventListener('loadeddata', () => {
    const width = video.videoWidth;
    const height = video.videoHeight;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    canvas.width = width;
    canvas.height = height;

    const imageCaptureInterval = 6000; // Capture every 5 seconds
    const confidenceThreshold = 70;
    const boundingBoxExtensionFactor = 1.25;

    // Main interval function
    setInterval(() => {
        context.drawImage(video, 0, 0, width, height);
        const imageData = context.getImageData(0, 0, width, height);
        
        // Convert the captured frame to grayscale
        const grayImageData = convertToGrayScale(imageData);

        const contrastFactor = 10; // Experiment with different values
        const contrastedGrayImageData = increaseContrast(grayImageData, contrastFactor);

        // Apply edge detection using a Sobel filter 
        const sobelImageData = applySobelFilter(contrastedGrayImageData, width, height);

        // Apply Hough Transform to detect lines 
        const houghImageData = applyHoughTransform(sobelImageData, width, height);

        // Find the dominant line in the accumulator
        const thresholdForLineDetection = 75;
        const { angle } = findDominantLine(houghImageData, thresholdForLineDetection);

        correctRotationAndSkew(canvas, angle).then(correctedCanvas => {
        // Perform OCR on the preprocessed image
            Tesseract.recognize(
                correctedCanvas.toDataURL(),
                'eng',
                {
                    logger: m => console.log(m),
                    psm: 3
                }
            ).then(result => {
                // Extract and display subsections of the image where text is detected
                if (result && result.data && result.data.words) {
                    const words = result.data.words;

                    // Clear previous results
                    resultsTable.querySelectorAll('tr:not(:first-child)').forEach(row => row.remove());

                    words.forEach(word => {
                        // Check confidence level
                        if (word.confidence >= confidenceThreshold) {
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
                            croppedContext.drawImage(correctedCanvas, extendedX0, extendedY0, extendedX1 - extendedX0, extendedY1 - extendedY0, 0, 0, extendedX1 - extendedX0, extendedY1 - extendedY0);

                            // Display subsections on the screen
                            const newRow = resultsTable.insertRow();
                            const cellImage = newRow.insertCell(0);
                            const cellText = newRow.insertCell(1);

                            cellImage.innerHTML = `<img src="${croppedCanvas.toDataURL()}" />`;
                            cellText.textContent = word.text;
                        }
                    });
                }
            }).catch(error => {
                console.error("Error during text recognition:", error);
            });
        });

    }, imageCaptureInterval);

    async function correctRotationAndSkew(inputCanvas, angle) {
        const img = new Image();
        img.src = inputCanvas.toDataURL();
    
        return new Promise(resolve => {
            img.onload = () => {
                const correctedCanvas = rotateImage(img, angle);
                resolve(correctedCanvas);
            };
        });
    }

    function convertToGrayScale(imageData) {
        const grayImageData = new ImageData(width, height);
    
        for (let i = 0; i < imageData.data.length; i += 4) {
            const avg = (imageData.data[i] + imageData.data[i + 1] + imageData.data[i + 2]) / 3;
            grayImageData.data[i] = avg;
            grayImageData.data[i + 1] = avg;
            grayImageData.data[i + 2] = avg;
            grayImageData.data[i + 3] = imageData.data[i + 3]; // Preserve alpha channel
        }

        return grayImageData;
    }
    
    // Function for increasing contrast (as provided in the previous message)
    function increaseContrast(grayImageData, contrastFactor) {
        const contrastedGrayImageData = new ImageData(width, height);
    
        // Calculate contrast midpoint
        const midpoint = 208; // You can adjust this value based on your preference
    
        for (let j = 0; j < grayImageData.data.length; j += 4) {
            // Adjust each channel independently
            contrastedGrayImageData.data[j] = contrastAdjust(grayImageData.data[j], midpoint, contrastFactor);     // Red channel
            contrastedGrayImageData.data[j + 1] = contrastAdjust(grayImageData.data[j + 1], midpoint, contrastFactor); // Green channel
            contrastedGrayImageData.data[j + 2] = contrastAdjust(grayImageData.data[j + 2], midpoint, contrastFactor); // Blue channel
            contrastedGrayImageData.data[j + 3] = grayImageData.data[j + 3]; // Preserve alpha channel
        }
    
        return contrastedGrayImageData;
    }

    function contrastAdjust(value, midpoint, contrastFactor) {
        // Adjust the contrast of a single channel value
        return Math.round(contrastFactor * (value - midpoint) + midpoint);
    }

    function applySobelFilter(contrastedGrayImageData) {        
        const sobelImageData = new ImageData(width, height);

        const sobelKernelX = [
            [-1, -2, 0, 2, 1],
            [-4, -8, 0, 8, 4],
            [-6, -12, 0, 12, 6],
            [-4, -8, 0, 8, 4],
            [-1, -2, 0, 2, 1]
        ];
        
        const sobelKernelY = [
            [-1, -4, -6, -4, -1],
            [-2, -8, -12, -8, -2],
            [0, 0, 0, 0, 0],
            [2, 8, 12, 8, 2],
            [1, 4, 6, 4, 1]
        ];
    
        const convolution = (kernel, x, y) => {
            let sum = 0;
            for (let i = 0; i < kernel.length; i++) {
                for (let j = 0; j < kernel[i].length; j++) {
                    const pixelX = x + i - Math.floor(kernel.length / 2);
                    const pixelY = y + j - Math.floor(kernel[i].length / 2);
    
                    const pixelValue = getPixelValue(contrastedGrayImageData, pixelX, pixelY);
                    sum += pixelValue * kernel[i][j];
                }
            }
            return sum;
        };
    
        const getPixelValue = (imageData, x, y) => {
            if (x < 0 || x >= imageData.width || y < 0 || y >= imageData.height) {
                return 0;
            }
            const index = (y * imageData.width + x) * 4;
            return imageData.data[index];
        };
    
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const gradientX = convolution(sobelKernelX, x, y);
                const gradientY = convolution(sobelKernelY, x, y);
    
                const magnitude = Math.sqrt(gradientX ** 2 + gradientY ** 2);
    
                const index = (y * width + x) * 4;
                sobelImageData.data[index] = magnitude;
                sobelImageData.data[index + 1] = magnitude;
                sobelImageData.data[index + 2] = magnitude;
                sobelImageData.data[index + 3] = 255; // Alpha channel
            }
        }
        console.log("Pixel value at (0, 0):", sobelImageData.data[0]);
        console.log("Pixel value at (10, 10):", sobelImageData.data[4 * (width * 10 + 10)]);
        return sobelImageData;
    }

    function applyHoughTransform(sobelImageData) {
        const accumulator = createAccumulator(width, height);
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const pixelValue = sobelImageData.data[(y * width + x) * 4];
                if (pixelValue > 0) {
                    // Perform Hough Transform
                    accumulateLines(accumulator, x, y, width, height);
                }
            }
        }
        const houghImageData = accumulator; 
        return houghImageData;
    }
    
    function createAccumulator() {
        return new Array(180).fill(0).map(() => new Array(Math.hypot(width, height)).fill(0));
    }
    
    function accumulateLines(accumulator, x, y) {
        for (let theta = 0; theta < 180; theta++) {
            const rho = x * Math.cos(degreesToRadians(theta)) + y * Math.sin(degreesToRadians(theta));
            accumulator[theta][Math.floor(rho)]++;
        }
    }
    
    function degreesToRadians(degrees) {
        return degrees * (Math.PI / 180);
    }

    function findDominantLine(houghImageData, thresholdForLineDetection) {
        let maxVotes = 0;
        let angle = 0;
    
        for (let theta = 0; theta < houghImageData.length; theta++) {
            for (let rho = 0; rho < houghImageData[theta].length; rho++) {
                const votes = houghImageData[theta][rho];
    
                // Consider lines with votes above the threshold
                if (votes > thresholdForLineDetection && votes > maxVotes) {
                    maxVotes = votes;
                    angle = theta;
                }
            }
        }
    
        // Calculate the angle based on the dominant line
        return { angle };
    }

    function rotateImage(img, angle) {
        console.log(angle);
        const rotationAngle = degreesToRadians(angle); // Change the sign of the rotation angle
    
        // Create a new canvas for the rotated image
        const rotatedCanvas = document.createElement('canvas');
        const rotatedContext = rotatedCanvas.getContext('2d');
    
        // Set the canvas size based on the rotated image dimensions
        rotatedCanvas.width = img.width;
        rotatedCanvas.height = img.height;
    
        // Reset transformation matrix to identity
        rotatedContext.setTransform(1, 0, 0, 1, 0, 0);
    
        // Move the rotation point to the center of the canvas
        rotatedContext.translate(rotatedCanvas.width / 2, rotatedCanvas.height / 2);
    
        // Rotate the canvas
        rotatedContext.rotate(360 - rotationAngle);
    
        // Draw the image onto the rotated canvas
        rotatedContext.drawImage(img, -img.width / 2, -img.height / 2, img.width, img.height);
    
        // Reset transformation matrix to identity
        rotatedContext.setTransform(1, 0, 0, 1, 0, 0);
    
        return rotatedCanvas;
    }
});
