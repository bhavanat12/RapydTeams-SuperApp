import express from 'express';
import hbs from 'hbs'
import fileUpload from 'express-fileupload';
import path from 'path';
import { fileURLToPath } from "url";
import azureStorage from "azure-storage";
import intoStream from "into-stream";
import dotenv from "dotenv";
const containerName = "rapyd-attachments";

const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();

app.use(fileUpload({
    createParentPath: true,
  }));

app.set('view engine', '.hbs');

app.set('views', path.join(__dirname, 'views'));
app.use(express.static(__dirname + '/public'));

app.use(express.static(__dirname + '/public'));

hbs.registerHelper("json", function (context) {
        return JSON.stringify(context);
      })

const blobService = azureStorage.createBlobService(
  process.env.AZURE_STORAGE_CONNECTION_STRING
);


app.get('/checkout/:checkoutid', (req, res) => {
  let metadata = req.query
  console.log(metadata)
  res.render('main', {
    data: req.params['checkoutid'],
    metadata: metadata,
    botid: process.env.botid
  })
});

app.get('/checkout_shop/:checkoutid', (req, res) => {
  res.render('main', {
    data: req.params['checkoutid'],
    metadata: {"shop": true},
    botid: process.env.botid
  })
});

app.get('/', (req, res)=>{
  var reimbinfo = ""
  if(req.query){
    reimbinfo = req.query["reimbinfo"]
  }
  res.render('index', {
    reimbinfo: reimbinfo
  })
})

app.get('/upload', function(req, res) {
  return res.status(200).send("Operation Successful.");
});

app.post("/upload", (request, response) => {
  if (!request.files) {
    return request.status(400).send("No files are received.");
  }

  var sellData = {};
  console.log(Object.keys(request.files).length);

  // 11.1.  
  for (let i = 0; i < Object.keys(request.files).length; i++) {

    var temp = {};

    var attach = 'attachment'+String(i);
    console.log(request.files[attach]);
    const blobName = request.files[attach].name;
    temp['attachment'] = blobName;
    console.log(`Blob Name ${blobName}`);
    // 11.2. 
    const stream = intoStream(request.files[attach].data);
    console.log(`stream ${stream}`);
    // 11.3. 
    const streamLength = request.files[attach].data.length;
    console.log(`Length ${streamLength}`);
    // 11.4. 
    var tempOutput = blobService.createBlockBlobFromStream(
      containerName,
      blobName,
      stream,
      streamLength,
      (err) => {
        if (err) {
          response.status(500);
          response.send({ message: "Error Occured" });
          return;
        }
      }
    );

    var pric = 'price'+String(i);
    var dsc = 'subject'+String(i);
    temp['price'] = request.body[pric];
    temp['subject'] = request.body[dsc];

    sellData[String(i)] = temp;
  }
  
      var forMe = {
        "sellingData" : sellData,
        "reimbinfo": request.body["reimbinfo"],
        "botid": process.env.botid
      };
      console.log(forMe);
      response.render('viewData', forMe);
});

app.listen(3000, () => {
  console.log('server started');
});
