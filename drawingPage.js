// Get the button element
const captureButton = document.getElementById('captureButton');

// Add click event listener to the button
captureButton.addEventListener('click', () => {
  // Get the div element you want to capture
  const divToCapture = document.getElementById('canva');

  // Use HTML2Canvas to capture the div as a canvas
  html2canvas(divToCapture).then(canvas => {
    // Convert the canvas to a data URL
    const dataURL = canvas.toDataURL();

    // Create a temporary link element
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = 'screenshot.png';

    // Simulate a click on the link to trigger the download
    link.click();
  });
});