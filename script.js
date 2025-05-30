const videoElement = document.getElementById('videoElement');
const canvasElement = document.getElementById('canvasElement');
const imgElement = document.getElementById('imgElement');

const startCameraBtn = document.getElementById('startCameraBtn');
const takePictureBtn = document.getElementById('takePictureBtn');
const startRecordBtn = document.getElementById('startRecordBtn');
const stopRecordBtn = document.getElementById('stopRecordBtn');

const downloadLinksContainer = document.getElementById('downloadLinks');
const imageOutputContainer = document.getElementById('imageOutput');
const videoOutputContainer = document.getElementById('videoOutput');

let stream = null;
let mediaRecorder = null;
let recordedChunks = [];
let currentFacingMode = 'environment'; // To keep track of preferred facing mode

// --- Sound Effects ---
let audioContext;

function getAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContext;
}

// --- Camera Error Handling ---
function handleCameraError(err) {
    console.error("Error accessing camera:", err.name, err.message, err); // Full error to console
    let alertMessage = "Could not access camera. Please ensure permissions are granted and try again.\n\n";
    alertMessage += `Error: ${err.name}\n`;

    switch (err.name) {
        case "NotAllowedError": // Standard
        case "PermissionDeniedError": // Older browsers
            alertMessage += "Permission to access the camera and/or microphone was denied. Please check your browser and system settings to allow access for this page/site.";
            break;
        case "NotFoundError": // Standard
        case "DevicesNotFoundError": // Older browsers
            alertMessage += "No camera and/or microphone was found. Please ensure one is connected and enabled. If you have multiple cameras, the preferred one ('rear camera') might not be available.";
            break;
        case "NotReadableError": // Standard
        case "TrackStartError": // Older browsers
            alertMessage += "The camera and/or microphone could not be started. It might be in use by another application, or there could be a hardware error. Try closing other apps or browser tabs that might be using the camera/microphone.";
            break;
        case "OverconstrainedError": // Standard
            alertMessage += `The camera does not support the requested settings (e.g., resolution, 'rear camera' preference). Your device might not have a camera that matches these requirements. Error: ${err.message}`;
            break;
        case "SecurityError": // Standard
            alertMessage += "Access to the camera and/or microphone is not allowed from this page. This might be due to security settings in your browser or operating system, or because the page is not loaded over a secure connection (HTTPS). Ensure the page is loaded securely (https://).";
            break;
        case "TypeError": // Standard (e.g. constraints object malformed)
            alertMessage += "There was a technical issue with the camera request (e.g., invalid settings). This might be a bug in the application.";
            break;
        default:
            alertMessage += `An unexpected error occurred: ${err.message}. Check the browser console for more details.`;
    }
    
    alert(alertMessage);

    // Reset UI to reflect camera failed/stopped state
    startCameraBtn.textContent = 'Start Camera';
    takePictureBtn.disabled = true;
    startRecordBtn.disabled = true;
    stopRecordBtn.disabled = true;
    videoElement.style.display = 'none';
    videoElement.srcObject = null; // Clear the srcObject
    if (stream) {
        stream.getTracks().forEach(track => track.stop()); // Ensure all tracks are stopped
        stream = null;
    }
}

// --- Camera Logic ---
startCameraBtn.addEventListener('click', async () => {
    getAudioContext(); // Initialize AudioContext on user gesture, if not already.

    if (stream) { // If stream exists, this button now acts as "Stop Camera"
        stream.getTracks().forEach(track => track.stop());
        videoElement.srcObject = null;
        videoElement.style.display = 'none';
        stream = null;
        
        startCameraBtn.textContent = 'Start Camera';
        takePictureBtn.disabled = true;
        startRecordBtn.disabled = true;
        stopRecordBtn.disabled = true;
        
        // Reset media outputs
        imgElement.style.display = 'none';
        imgElement.src = '#';
        clearDownloadLinks();
        videoOutputContainer.innerHTML = '<p>Last Video Recorded:</p>'; // Clear previous video preview
        return;
    }

    // If no stream, try to start it
    try {
        // Attempt to get stream with preferred facing mode
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: currentFacingMode
            },
            audio: true // Request audio for recording capabilities
        });
    } catch (err) {
        // If initial attempt fails (e.g. OverconstrainedError for facingMode), try fallback
        if (err.name === "OverconstrainedError" || err.name === "NotFoundError") {
            console.warn(`getUserMedia failed with facingMode '${currentFacingMode}'. Trying default video device.`);
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: true, // Let browser pick camera
                    audio: true
                });
                // If successful with fallback, update currentFacingMode if knowable, or assume 'user'
                // For simplicity, we won't try to guess which camera was chosen by fallback.
            } catch (fallbackErr) {
                handleCameraError(fallbackErr); // Handle error from fallback attempt
                return;
            }
        } else {
            handleCameraError(err); // Handle other errors from initial attempt
            return;
        }
    }

    videoElement.srcObject = stream;
    videoElement.style.display = 'block';
    // videoElement.play() often not needed due to autoplay, but can be added if issues arise.

    startCameraBtn.textContent = 'Stop Camera'; 
    takePictureBtn.disabled = false;
    startRecordBtn.disabled = false;
    stopRecordBtn.disabled = true; // Stop recording is disabled until recording starts

    // Reset UI elements for new session
    imgElement.style.display = 'none';
    imgElement.src = '#';
    clearDownloadLinks();
    videoOutputContainer.innerHTML = '<p>Last Video Recorded:</p>';

});

takePictureBtn.addEventListener('click', async () => {
    if (!stream || !stream.active) {
        alert("Camera not active. Please start the camera first.");
        return;
    }

    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
    const context = canvasElement.getContext('2d');
    context.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

    const dataUrl = canvasElement.toDataURL('image/png');
    imgElement.src = dataUrl;
    imgElement.style.display = 'block';

    clearDownloadLinks('image');
    createDownloadLink(dataUrl, 'picture.png', 'image/png', 'image');
});

startRecordBtn.addEventListener('click', async () => {
    if (!stream || !stream.active) {
        alert("Camera not active. Please start the camera first.");
        return;
    }
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        alert("Already recording.");
        return;
    }

    recordedChunks = [];
    const options = { mimeType: 'video/webm; codecs=vp9,opus' }; // Prioritize webm with vp9/opus for wide compatibility
    try {
        mediaRecorder = new MediaRecorder(stream, options);
    } catch (e1) {
        console.warn("webm/vp9/opus not supported, trying vp8/opus", e1);
        try {
            const options2 = { mimeType: 'video/webm; codecs=vp8,opus' };
            mediaRecorder = new MediaRecorder(stream, options2);
        } catch (e2) {
            console.warn("webm/vp8/opus not supported, trying default", e2);
             try {
                mediaRecorder = new MediaRecorder(stream); // Browser default
            } catch (e3) {
                alert("MediaRecorder is not supported by your browser or with the current camera stream.");
                console.error("Error initializing MediaRecorder:", e3);
                return;
            }
        }
    }
    

    mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
            recordedChunks.push(event.data);
        }
    };

    mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'video/webm' });
        const videoUrl = URL.createObjectURL(blob);

        // Display the recorded video
        videoOutputContainer.innerHTML = `
            <p>Last Video Recorded:</p>
            <video src="${videoUrl}" controls width="100%"></video>
        `;
        
        clearDownloadLinks('video');
        createDownloadLink(videoUrl, 'video.webm', blob.type, 'video');
        
        // Re-enable start recording and take picture, disable stop
        startRecordBtn.disabled = false;
        takePictureBtn.disabled = false;
        stopRecordBtn.disabled = true;
        startRecordBtn.textContent = 'Start Recording';
    };

    mediaRecorder.start();
    startRecordBtn.textContent = 'Recording...';
    startRecordBtn.disabled = true;
    takePictureBtn.disabled = true; // Disable taking picture while recording
    stopRecordBtn.disabled = false;
});

stopRecordBtn.addEventListener('click', async () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        // UI updates are handled in mediaRecorder.onstop
    } else {
        // This case should ideally not be reachable if buttons are managed correctly
        stopRecordBtn.disabled = true;
        startRecordBtn.disabled = false;
        takePictureBtn.disabled = false;
    }
});

function createDownloadLink(href, filename, type, category) {
    const link = document.createElement('a');
    link.href = href;
    link.download = filename;
    link.textContent = `Download ${category === 'image' ? 'Picture' : 'Video'} (${filename})`;
    link.target = '_blank'; // Good for data URLs on some browsers
    downloadLinksContainer.appendChild(link);
}

function clearDownloadLinks(category = null) {
    const links = downloadLinksContainer.querySelectorAll('a');
    links.forEach(link => {
        const isImageLink = link.download.includes('picture');
        const isVideoLink = link.download.includes('video');

        if (category === 'image' && isImageLink) {
            link.remove();
        } else if (category === 'video' && isVideoLink) {
            link.remove();
        } else if (!category) { // Clear all if no category specified
            link.remove();
        }
    });
}

// Initial state
function setInitialState() {
    takePictureBtn.disabled = true;
    startRecordBtn.disabled = true;
    stopRecordBtn.disabled = true;
    imgElement.style.display = 'none';
    videoElement.style.display = 'none'; // Hide video element until stream starts
}

// Initialize
setInitialState();