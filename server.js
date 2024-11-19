const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = 41596;
const TARGET_PORT = 41595; // The port of the original server

// Configure CORS to allow requests from your frontend's origin
app.use(cors({
  origin: 'https://app.follow.is', // Replace with the actual frontend URL
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
  name = name.replace(/\[图片\]/g, "")
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

// Endpoint to get the folder list by forwarding to the target server
app.get('/api/folder/list', async (req, res) => {
  try {
    console.log("request body", req.body);
    // Forward the request to the target server
    const response = await fetch(`http://localhost:${TARGET_PORT}/api/folder/list`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Get the JSON data from the response
    const data = await response.json();
    console.log('response', data);
    // Send the response data back to the client
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Error fetching folder list:', error);
    res.status(500).json({ error: 'Failed to fetch folder list' });
  }
});


// Define the /api/item/addFromURLs endpoint to forward to the target server
app.post('/api/item/addFromURLs', async (req, res) => {
  let { category, feedTitle, entriesTitle, items, feedUrl } = req.body;
  // console.log('Request body:', req.body);
  try {
    // Step 1: Get the list of folders and find the category folder
    const folders = await getFolderList();
    if (!category) {
      console.log(feedUrl);
      if (feedUrl.includes("weibo")) {
        category = "微博";
      } else if (feedUrl.includes("meetduner") || feedUrl.includes("circlee_shen")) {
        category = "Instagram-Follow";
      }
    }

    let categoryFolder = folders.find(folder => folder.name === category);
    console.log("categoryFolderId", categoryFolder.id);
    if (!categoryFolder) {
      categoryFolder = await createFolder(category, null);
      
      if (!categoryFolder) {
        return res.status(400).json({ status: 'error', message: 'Category folder not found' }); 
      }
    }

    // Step 2: Check if the feedTitle folder exists within the category folder
    let feedFolderId = categoryFolder?.children?.find(folder => folder.name === feedTitle)?.id;
    
    // Step 3: If the feedTitle folder doesn’t exist, create it under the category folder
    if (!feedFolderId) {
      feedFolderId = await createFolder(feedTitle, categoryFolder.id);
      if (!feedFolderId) {
        return res.status(500).json({ status: 'error', message: 'Failed to create feed folder' });
      }
    }

    // Step 4: Create the entriesTitle folder within the feedTitle folder
    let entriesFolderId = await createFolder(entriesTitle, feedFolderId);
    if (!entriesFolderId) {
      const date = new Date(items[0].modificationTime);
      const newEntriesTitle = date.toISOString().split('T')[0]; // YYYY-MM-DD format

      entriesFolderId = await createFolder(newEntriesTitle, feedFolderId);

      if (!entriesFolderId) {
        return res.status(500).json({ status: 'error', message: 'Failed to create entries folder' });
      }
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
          name: item.name.replace(/\[图片\]/g, ""),
        })),
        folderId: entriesFolderId, // Specify the entries folder ID for each item
      }),
    //   body: JSON.stringify({
    //     items: items.map(item => {
    //       console.log('Before replacement:', item.name); // Log the name before replacement
    //       if (typeof item.name === 'string') {
    //         item.name = item.name.replace(/\[图片\]/g, ""); // Replace the string
    //         console.log('After replacement:', item.name); // Log the name after replacement
    //       } else {
    //         console.warn('Item name is not a string:', item.name); // Handle non-string names
    //       }
    //       return {
    //         ...item,
    //         name: item.name, // Ensure modified name is returned
    //       };
    //     }),
    //     folderId: entriesFolderId, // Specify the entries folder ID for each item
    //   }),
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
