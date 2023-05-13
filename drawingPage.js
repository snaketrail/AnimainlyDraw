// Get the merge button element
const mergeButton = document.getElementById('mergeButton');
mergeButton.addEventListener('click', mergeImages);

function mergeImages() {
  // Get the canva element
  const canva = document.getElementById('canva');

  // Create a new canvas to draw the merged image
  const mergedCanvas = document.createElement('canvas');
  const mergedCtx = mergedCanvas.getContext('2d');

  // Set the merged canvas size based on the canva element
  mergedCanvas.width = canva.offsetWidth;
  mergedCanvas.height = canva.offsetHeight;

  // Get all the images inside the canva element
  const images = canva.getElementsByTagName('img');

  // Draw each image onto the merged canvas
  Array.from(images).forEach((image) => {
    mergedCtx.drawImage(image, 0, 0);
  });

  // Convert the merged canvas content into an image
  const mergedImage = new Image();
  mergedImage.src = mergedCanvas.toDataURL();

  // Create a download link for the merged image
  const anchor = document.createElement('a');
  anchor.href = mergedImage.src;
  anchor.download = 'merged_image.png';
  anchor.click();
}
