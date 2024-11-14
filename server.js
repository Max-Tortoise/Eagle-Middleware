const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = 41596;
const TARGET_PORT = 41595; // The port of the original server

// Configure CORS to allow requests from your frontend's origin
app.use(cors({
  origin: 'https://dev.follow.is', // Replace with the actual frontend URL
  methods: ['POST', 'GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

// Parse incoming JSON requests
app.use(bodyParser.json());

// Helper function to get the folder list from the target server
const getFolderList = async () => {
  const response = await fetch(`http://localhost:${TARGET_PORT}/api/folder/list`);
  const data = await response.json();
  return data.data || [];
};

// Helper function to create a folder with a specified name and parent folder ID
const createFolder = async (name, parentId) => {
  const response = await fetch(`http://localhost:${TARGET_PORT}/api/folder/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ folderName: name, parent: parentId })
  });
  const data = await response.json();
  return data?.data?.id; // Return the new folder ID if successful
};


// Root endpoint to check if the server is running
app.get('/', (req, res) => {
  res.send('Eagle proxy server is running and forwarding requests!');
});

// Define the /api/item/addFromURLs endpoint to forward to the target server
app.post('/api/item/addFromURLs', async (req, res) => {
  const { category, feedTitle, entriesTitle, items } = req.body;
  // console.log('Request body:', req.body);
  try {
    // Step 1: Get the list of folders and find the category folder
    const folders = await getFolderList();
    let categoryFolder = folders.find(folder => folder.name === category);
    if (!categoryFolder) {
      categoryFolder = await createFolder(category, null);
      if (!categoryFolder) {
        return res.status(400).json({ status: 'error', message: 'Category folder not found' }); 
      }
    }

    // Step 2: Check if the feedTitle folder exists within the category folder
    let feedFolderId = categoryFolder.children.find(folder => folder.name === feedTitle)?.id;

    // Step 3: If the feedTitle folder doesn’t exist, create it under the category folder
    if (!feedFolderId) {
      feedFolderId = await createFolder(feedTitle, categoryFolder.id);
      if (!feedFolderId) {
        return res.status(500).json({ status: 'error', message: 'Failed to create feed folder' });
      }
    }

    // Step 4: Create the entriesTitle folder within the feedTitle folder
    const entriesFolderId = await createFolder(entriesTitle, feedFolderId);
    if (!entriesFolderId) {
      return res.status(500).json({ status: 'error', message: 'Failed to create entries folder' });
    }

    // Step 5: Forward the request to add items to the entries folder
    const response = await fetch(`http://localhost:${TARGET_PORT}/api/item/addFromURLs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: items.map(item => ({
          ...item,
        })),
        folderId: entriesFolderId, // Specify the entries folder ID for each item
      }),
    });

    // Get the response from the original server
    const data = await response.json();

    // Send the response back to the client
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Error forwarding request:', error);
    res.status(500).json({ status: 'error', message: 'Failed to forward request' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Proxy server is running on http://localhost:${PORT}`);
});
