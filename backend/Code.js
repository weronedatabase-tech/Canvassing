const TEMPLATE_ROOT_FOLDER_ID = "1A8jf8VQ7B5zAc7D4sEcW-Kr04V3XTKWT";
const DEFAULT_ADMIN_PIN = "1234";
 
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Fundraising Shop')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function doPost(e) {
  const output = { success: false, data: null, message: '' };
  try {
    const request = JSON.parse(e.postData.contents);
    const action = request.action;
   
    const protectedActions = [
      'UPDATE_CONFIG', 'ADD_PRODUCT', 'DELETE_PRODUCT', 
      'CREATE_EVENT', 'SAVE_ORDER', 'RESET_ORDER', 
      'GET_ORDERS', 'UPDATE_ORDER_STATUS',
      'GET_EVENTS', 'SWITCH_EVENT', 'UPLOAD_BANNER'
    ];

    if (protectedActions.includes(action)) {
      verifyAdmin(request.pin);
    }

    switch (action) {
      case 'GET_APP_DATA':
        output.data = getAppData();
        output.success = true;
        break;

      case 'VERIFY_ADMIN':
        verifyAdmin(request.pin);
        output.success = true;
        break;
       
      case 'UPDATE_CONFIG':
        updateConfig(request.payload);
        output.success = true;
        output.message = "Settings updated.";
        break;

      case 'ADD_PRODUCT':
        addProduct(request.payload);
        output.success = true;
        output.message = "Product added.";
        break;
        
      case 'UPLOAD_BANNER': // NEW
        const bannerId = uploadBanner(request.payload);
        output.data = { bannerId: bannerId };
        output.success = true;
        output.message = "Banner uploaded.";
        break;
     
      case 'DELETE_PRODUCT':
        deleteProduct(request.payload);
        output.success = true;
        output.message = "Product deleted.";
        break;

      case 'SAVE_ORDER':
        saveProductOrder(request.payload);
        output.success = true;
        output.message = "Listing saved.";
        break;

      case 'RESET_ORDER':
        resetProductOrder();
        output.success = true;
        output.message = "Reset to Alphabetical.";
        break;
       
      case 'CREATE_EVENT':
        output.data = createNewEvent(request.eventName);
        output.success = true;
        output.message = "New Event Created!";
        break;

      case 'GET_EVENTS':
        output.data = getAllEvents();
        output.success = true;
        break;

      case 'SWITCH_EVENT':
        switchEvent(request.payload.folderId);
        output.success = true;
        output.message = "Event Switched Successfully";
        break;
       
      case 'SUBMIT_ORDER':
        output.data = submitOrder(request.payload);
        output.success = true;
        output.message = "Order submitted!";
        break;

      case 'GET_ORDERS':
        output.data = getOrders();
        output.success = true;
        break;

      case 'UPDATE_ORDER_STATUS':
        updateOrderStatus(request.payload.orderId, request.payload.status);
        output.success = true;
        output.message = "Status updated.";
        break;
       
      default:
        throw new Error("Invalid Action: " + action);
    }
   
  } catch (err) {
    output.success = false;
    output.message = err.toString();
  }
  return ContentService.createTextOutput(JSON.stringify(output))
    .setMimeType(ContentService.MimeType.JSON);
}

// --- HELPERS ---
function getScriptProp(key, defaultValue) {
  const val = PropertiesService.getScriptProperties().getProperty(key);
  return val ? JSON.parse(val) : defaultValue;
}

function setScriptProp(key, val) {
  PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(val));
}

function verifyAdmin(pin) {
  const config = getScriptProp('APP_CONFIG', {});
  const storedPin = config.adminPin || DEFAULT_ADMIN_PIN;
  if (pin !== storedPin) throw new Error("Incorrect Admin PIN");
}

function getEventFolder() {
  const activeEvent = getScriptProp('ACTIVE_EVENT', null);
  if (!activeEvent || !activeEvent.folderId) return null;
  return DriveApp.getFolderById(activeEvent.folderId);
}

function getProductsFolder(createIfMissing = false) {
  const eventFolder = getEventFolder();
  if (!eventFolder) return null;
  const folders = eventFolder.getFoldersByName("Products");
  if (folders.hasNext()) return folders.next();
  if (createIfMissing) return eventFolder.createFolder("Products");
  return null;
}

// --- CORE LOGIC ---

function getAppData() {
  const config = getScriptProp('APP_CONFIG', {
    appTitle: "Fundraising Drive", // Default Title
    intro: "Welcome!", 
    paymentInfo: "", 
    adminPin: DEFAULT_ADMIN_PIN,
    closingDate: "",
    emailIntro: "",
    emailFooter: "",
    bannerImageId: null // New Banner Field
  });
  const activeEvent = getScriptProp('ACTIVE_EVENT', { name: "None", id: null, sheetId: null });
  const savedOrder = getScriptProp('PRODUCT_ORDER', null);
  let products = [];
  const prodFolder = getProductsFolder(false);
  
  if (prodFolder) {
    const files = prodFolder.getFiles();
    while (files.hasNext()) {
      const file = files.next();
      const filename = file.getName();
      const lastUnderscore = filename.lastIndexOf('_');
      if (lastUnderscore > -1) {
        const name = filename.substring(0, lastUnderscore);
        const price = parseFloat(filename.substring(lastUnderscore + 1));
        if (!isNaN(price)) {
          products.push({
            id: file.getId(),
            name: name,
            price: price,
            image: "https://lh3.googleusercontent.com/d/" + file.getId()
          });
        }
      }
    }
  }

  if (savedOrder && Array.isArray(savedOrder) && savedOrder.length > 0) {
    products.sort((a, b) => {
      const idxA = savedOrder.indexOf(a.id);
      const idxB = savedOrder.indexOf(b.id);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.name.localeCompare(b.name);
    });
  } else {
    products.sort((a, b) => a.name.localeCompare(b.name));
  }

  const publicConfig = { ...config };
  delete publicConfig.adminPin;

  return {
    config: publicConfig,
    products,
    activeEventName: activeEvent.name,
    activeSheetId: activeEvent.sheetId,
    activeFolderId: activeEvent.folderId
  };
}

function getAllEvents() {
  const root = DriveApp.getFolderById(TEMPLATE_ROOT_FOLDER_ID);
  const folders = root.getFolders();
  const events = [];
  while (folders.hasNext()) {
    const f = folders.next();
    events.push({ name: f.getName(), id: f.getId() });
  }
  return events.sort((a,b) => b.name.localeCompare(a.name));
}

function switchEvent(folderId) {
  const folder = DriveApp.getFolderById(folderId);
  const files = folder.getFilesByType(MimeType.GOOGLE_SHEETS);
  let sheetId = null;
  if (files.hasNext()) {
    sheetId = files.next().getId();
  } else {
    throw new Error("No Google Sheet found in the selected folder.");
  }

  setScriptProp('ACTIVE_EVENT', { 
    name: folder.getName(), 
    sheetId: sheetId, 
    folderId: folderId 
  });
  
  resetProductOrder();
}

function createNewEvent(eventName) {
  if (!eventName) throw new Error("Event Name is required");
  const rootFolder = DriveApp.getFolderById(TEMPLATE_ROOT_FOLDER_ID);
  const folders = rootFolder.getFoldersByName("Template Canvassing Event");
  if (!folders.hasNext()) throw new Error("Template Folder not found");
  const templateFolder = folders.next();
  
  const newFolderName = eventName; 
  
  const newFolder = rootFolder.createFolder(newFolderName);
  const files = templateFolder.getFiles();
  let sheetFileId = null;
  while (files.hasNext()) {
    const file = files.next();
    const copiedFile = file.makeCopy(file.getName(), newFolder);
    if (file.getMimeType() === MimeType.GOOGLE_SHEETS) {
      copiedFile.setName(newFolderName);
      sheetFileId = copiedFile.getId();
    }
  }
  newFolder.createFolder("Products");
  if (!sheetFileId) throw new Error("Template Sheet not found");
  setScriptProp('ACTIVE_EVENT', { name: newFolderName, sheetId: sheetFileId, folderId: newFolder.getId() });
  resetProductOrder();
  return { eventName: newFolderName };
}

function addProduct(data) {
  const prodFolder = getProductsFolder(true);
  if (!prodFolder) throw new Error("No active event folder found.");
  const fileName = `${data.name}_${data.price}`;
  const blob = Utilities.newBlob(Utilities.base64Decode(data.imageBase64.split(',')[1]), data.mimeType, fileName);
  const file = prodFolder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
}

// NEW: Upload Banner Image to the Active Folder
function uploadBanner(data) {
  const eventFolder = getEventFolder();
  if (!eventFolder) throw new Error("No active event folder found.");
  
  const fileName = `Banner_${Date.now()}`;
  const blob = Utilities.newBlob(Utilities.base64Decode(data.imageBase64.split(',')[1]), data.mimeType, fileName);
  const file = eventFolder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getId();
}

function deleteProduct(fileId) {
  try {
    DriveApp.getFileById(fileId).setTrashed(true);
  } catch(e) { throw new Error("Could not delete file."); }
}

function saveProductOrder(idArray) {
  setScriptProp('PRODUCT_ORDER', idArray);
}

function resetProductOrder() {
  PropertiesService.getScriptProperties().deleteProperty('PRODUCT_ORDER');
}

function updateConfig(data) {
  const current = getScriptProp('APP_CONFIG', {});
  setScriptProp('APP_CONFIG', { ...current, ...data });
}

function submitOrder(data) {
  const activeEvent = getScriptProp('ACTIVE_EVENT', null);
  const config = getScriptProp('APP_CONFIG', {});
  
  if (config.closingDate) {
    const today = new Date();
    today.setHours(0,0,0,0);
    const closeDate = new Date(config.closingDate);
    if (today > closeDate) throw new Error("Shop is closed for new orders.");
  }

  if (!activeEvent || !activeEvent.sheetId) throw new Error("No active canvassing event.");

  let imageUrl = "No Image";
  if (data.paymentProofBase64) {
    const folder = DriveApp.getFolderById(activeEvent.folderId);
    const blob = Utilities.newBlob(Utilities.base64Decode(data.paymentProofBase64.split(',')[1]), data.mimeType, `Payment_${data.customerName}_${Date.now()}`);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    imageUrl = file.getUrl();
  }

  const orderId = data.orderId || "ORD-" + Math.floor(1000 + Math.random() * 9000);
  
  const rows = data.cart.map(item => [
    orderId, new Date(), item.name, item.price, item.qty, (item.price * item.qty),
    `${data.customerName} [${data.userType}${data.relatedName ? ': '+data.relatedName:''}]`,
    "'" + data.contact, data.email, imageUrl, "Pending"
  ]);

  const ss = SpreadsheetApp.openById(activeEvent.sheetId);
  const sheet = ss.getSheets()[0];
  if (rows.length > 0) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);

  // --- SEND EMAIL CONFIRMATION ---
  let emailStatus = "Not Sent";
  if (data.email && data.email.includes('@')) {
    try {
      const itemListHtml = data.cart.map(i => 
        `<tr>
           <td style="padding: 5px; border-bottom: 1px solid #eee;">${i.name}</td>
           <td style="padding: 5px; border-bottom: 1px solid #eee;">x${i.qty}</td>
           <td style="padding: 5px; border-bottom: 1px solid #eee;">$${(i.price * i.qty).toFixed(2)}</td>
         </tr>`
      ).join('');

      const customIntro = config.emailIntro 
        ? config.emailIntro.replace(/\n/g, '<br>') 
        : `Hi ${data.customerName},<br>Thank you for your support! We have received your order.`;
      
      // Removed Status line as requested
      const customFooter = config.emailFooter 
        ? config.emailFooter.replace(/\n/g, '<br>')
        : `If you have any questions, please reply to this email.<br><em>This is an automated message.</em>`;

      const htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <h2 style="color: #2563eb;">Order Confirmation</h2>
          <p>${customIntro}</p>
          
          <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Order ID:</strong> ${orderId}</p>
            <p style="margin: 5px 0;"><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
          </div>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <thead>
              <tr style="background: #2563eb; color: white;">
                <th style="padding: 8px; text-align: left;">Item</th>
                <th style="padding: 8px; text-align: left;">Qty</th>
                <th style="padding: 8px; text-align: left;">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${itemListHtml}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2" style="padding: 10px; text-align: right; font-weight: bold;">Total:</td>
                <td style="padding: 10px; font-weight: bold; color: #2563eb;">$${data.totalAmount.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>

          <p style="font-size: 12px; color: #666;">
            ${customFooter}
          </p>
        </div>
      `;

      MailApp.sendEmail({
        to: data.email,
        subject: `Order Confirmation: ${orderId}`,
        htmlBody: htmlBody
      });
      emailStatus = "Sent";
    } catch (emailErr) {
      console.error("Failed to send email: " + emailErr.toString());
      emailStatus = "Failed: " + emailErr.toString();
    }
  }

  return { orderId: orderId, emailStatus: emailStatus };
}

function getOrders() {
  const activeEvent = getScriptProp('ACTIVE_EVENT', null);
  if (!activeEvent || !activeEvent.sheetId) throw new Error("No active event to fetch orders from.");
  
  const ss = SpreadsheetApp.openById(activeEvent.sheetId);
  const sheet = ss.getSheets()[0];
  const lastRow = sheet.getLastRow();
  
  if (lastRow < 2) return []; 
  
  const lastCol = Math.max(sheet.getLastColumn(), 11); 
  const range = sheet.getRange(2, 1, lastRow - 1, lastCol);
  const data = range.getValues();
  
  const orders = data.map(row => ({
    orderId: row[0],
    date: row[1],
    item: row[2],
    qty: row[4],
    total: row[5],
    customer: row[6],
    contact: row[7],
    status: row[10] || "Pending" 
  }));
  
  return orders;
}

function updateOrderStatus(orderId, newStatus) {
  const activeEvent = getScriptProp('ACTIVE_EVENT', null);
  if (!activeEvent || !activeEvent.sheetId) throw new Error("No active event.");
  
  const ss = SpreadsheetApp.openById(activeEvent.sheetId);
  const sheet = ss.getSheets()[0];
  const lastRow = sheet.getLastRow();
  
  if (lastRow < 2) throw new Error("No orders found.");
  
  const range = sheet.getRange(2, 1, lastRow - 1, 1);
  const ids = range.getValues().flat();
  
  let found = false;
  for (let i = 0; i < ids.length; i++) {
    if (ids[i] == orderId) {
      sheet.getRange(i + 2, 11).setValue(newStatus);
      found = true;
    }
  }
  
  if (!found) throw new Error("Order ID not found.");
}

function forceEmailAuthorization() {
  const quota = MailApp.getRemainingDailyQuota();
  console.log("Email Quota Remaining: " + quota);
}
