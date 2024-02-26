import { LightningElement, track, api, wire } from 'lwc';
import sheetjs from '@salesforce/resourceUrl/SheetJS';
import { loadScript } from 'lightning/platformResourceLoader';
import getMetadataConfig from '@salesforce/apex/BulkUploadCtrl.getMetadataConfig';
import createIteration from '@salesforce/apex/BulkUploadCtrl.createIteration';
import uploadData from '@salesforce/apex/BulkUploadCtrl.uploadData';
import getTemplate from '@salesforce/apex/BulkUploadCtrl.getTemplate';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import LightningConfirm from "lightning/confirm";
import { NavigationMixin } from 'lightning/navigation';
import { CurrentPageReference } from 'lightning/navigation';
let XLS = {};
export default class BulkUploadData extends NavigationMixin(LightningElement) {
  @track _acceptedFormats = ['.xls', '.xlsx', '.csv'];
  _columns;
  _templateURL;
  _options;
  value;
  filesUploaded;
  file;
  fileContents;
  fileName;
  _hideUpload = false;
  _disableSave = true;
  _iterationId;
  showLoadingSpinner=false;
  totalLength;
  firstIndex;
  lastIndex;
  recordsLeft;
  tableLines;
  progress;
  batchsize;
  _uploadComplete;
  tableHeaderData=[];
  showSubmit;
  _disableSubmit;
  savedfile;
  url;
  outcome;
  type;
  iterationId;
  report;
  //uploadedfile;
  connectedCallback() {
   
    Promise.all([
        loadScript(this, sheetjs)
      ])
    .then(() => {
      XLS = XLSX
    })
    getMetadataConfig().then((result) => {
      // this._columns = result['columns'];
      // this._templateURL = result['pageURL'];
      this._options = result['options'];
    })
    .catch((error) => {
      this._columns = undefined;
    });
  }

  handleSelectChange(event){
    this.value = event.target.value;
    getTemplate({type: this.value })
    .then((data) => {
      this.url = data;
    })
  }

  handleFilesChange(event) {
    if (event.target.files.length > 0) {
      this.filesUploaded = event.target.files;
      this.file = this.filesUploaded[0];
      this.fileName = event.target.files[0].name;
      
      try {
        this.showLoadingSpinner = true;
        this.fileReader = new FileReader();
        this.fileReader.readAsBinaryString(this.file);

        this.fileReader.onloadend = (() => {
          let XLSX = window.XLSX;
          this.fileContents = this.fileReader.result;
          let workbook = XLSX.read(this.fileContents, { type: 'binary' });
          
          this.convertTocsvTable(workbook);
          this.showLoadingSpinner = false;
          this._disableSave = false;
        });
      } catch (e) {
        
      }
    }
  }
    
  convertTocsvTable(workbook) {
    let tableData = [];
    let header = [];
    workbook.SheetNames.forEach(function (sheetName) {
      let XLSX = window.XLSX;
      //let 
      let roa = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName], { header: 1 });
      console.log('sheetName::'+sheetName);
      if (roa.length > 0) {
        console.log(typeof roa);
        console.log('roa - ', JSON.stringify(roa));
        let csvData = roa.split('\n');
        console.log('csvData::', JSON.stringify(csvData));
        header = csvData[0];
        //this.columnHeader = jsonReq1[0];
        csvData.shift();
       
        // let jsonReqInput = [];
        // jsonReqInput.push(header);
        if (tableData.length == 0)
          tableData = [...csvData];

        //console.log('jsonReq1.slice(0, 10000):', );
        let csvHeaders = header.split(',');
        console.log('csvHeaders::', csvHeaders);
      }
    });
    this.tableHeaderData=header;
    this.tableLines=tableData;
  }

  handleSave() {
    createIteration({ fileName: this.fileName, type:this.value })
    .then((data) => {
      this._iterationId = data;
      //this.showLoadingSpinner = false;
      this.uploadRecords();
      this.showSubmit = true;
    })
    .catch((error) => {
      //this.showLoadingSpinner = false;
      console.log(error);
    });
  }
  
  handleSubmit() {
    this._disableSubmit = true;
    this.savedfile = true;
    inititeValidationBatch({ iterationId: this._iterationId,type: this.value })
    .then((data) => {
      this.outcome = data;
    })
  }

  uploadRecords() {
    
    this.showLoadingSpinner = true;
    this.totalLength = this.tableLines.length;
    this.firstIndex = 0;
    this.lastIndex = 0;
    this.recordsLeft = this.totalLength;
    let promises = [];
    this.isShowModal = true;
    this.progress = 1;
    if (this.totalLength >= 1000000) this.batchsize = 5000;
    else if(this.totalLength> 1000){
      this.batchsize = Math.floor(this.totalLength / 20);
    }
    else {
      this.batchsize = 10;//50
    }
    try {
      while (promises.length <= 5 && this.recordsLeft > 0) {
        if (this.recordsLeft <= this.batchsize) {
          let rowLines = this.tableLines.slice(this.firstIndex, this.totalLength);
          this.firstIndex = this.totalLength;
          this.recordsLeft = 0;
          let request = [];
          //request.push(this.header);
          request = [...rowLines];
          
          //this.progress = Math.round((this.totalLength - this.recordsLeft) / this.totalLength *100); 
          let promise = new Promise((resolve, reject) => {
            uploadData({ csvData: request, header: this.tableHeaderData, type: this.value, iterationId: this._iterationId })
              .then(result => {
                resolve(result);
                this.progress = Math.round((this.totalLength - this.recordsLeft) / this.totalLength * 100);
                if (this.progress == 100) this._uploadComplete = true;
              })
              .catch(error => {
                reject();
              });
          })
          promises.push(promise);
        }
        else {
      
          this.lastIndex += this.batchsize;
          let rowLines = this.tableLines.slice(this.firstIndex, this.lastIndex);
          this.firstIndex += this.batchsize;
          this.recordsLeft -= this.batchsize;
          let request = [];
          request = [...rowLines];
          this.type = this.value;
          this.iterationId = this._iterationId;
          let promise = new Promise((resolve, reject) => {
            uploadData({ csvData: request, header: this.tableHeaderData, type: this.type, iterationId : this.iterationId })
              .then(result => { resolve(result); this.progress = Math.round((this.totalLength - this.recordsLeft) / this.totalLength * 100); })
              .catch(error => {
                reject();
                console.log('error:', JSON.stringify(error));
              });
          })
          promises.push(promise);
        }
      }
      //this.allpromises = promises;
      this.saveAll(promises);
    }
    catch (e) {
      this.showLoadingSpinner = false;
    }
  }
  saveAll(promises) {
    Promise.all(promises).then((values) => {
      let promisesNextSet = [];
      if (this.recordsLeft > 0) {
        while (promisesNextSet.length <= 5 && this.recordsLeft > 0) {
          if (this.recordsLeft <= this.batchsize) {
            let rowLines = this.tableLines.slice(this.firstIndex, this.totalLength);
            this.firstIndex = this.totalLength;
            this.recordsLeft = 0;
            let request = [];
            request = [...rowLines];
            this.type = this.value;
          this.iterationId = this._iterationId;
            let promise = new Promise((resolve, reject) => {
              uploadData({ csvData: request, header: this.tableHeaderData, type: this.type, iterationId : this.iterationId })
                .then(result => {
                  resolve(result);
                  this.progress = Math.round((this.totalLength - this.recordsLeft) / this.totalLength * 100);
                  if (this.progress == 100) this._uploadComplete = true;
                })
                .catch(error => {
                  reject();
                });
            })
            promisesNextSet.push(promise);
          }
          else {
            this.lastIndex += this.batchsize;
            let rowLines = this.tableLines.slice(this.firstIndex, this.lastIndex);
           this.firstIndex += this.batchsize;
            this.recordsLeft -= this.batchsize;
            let request = [];
            request = [...rowLines];
            this.type = this.value;
          this.iterationId = this._iterationId;
            let promise = new Promise((resolve, reject) => {
              uploadData({ csvData: request, header: this.tableHeaderData, type: this.type, iterationId : this.iterationId })
                .then(result => {
                  resolve(result);
                  this.progress = Math.round((this.totalLength - this.recordsLeft) / this.totalLength * 100);
                  if (this.progress == 100) this._uploadComplete = true;
                })
                .catch(error => {
                  reject();
                });
            })
            promisesNextSet.push(promise);
          }
        }
      }
      else {
        this.showLoadingSpinner = false;
        this.progress = 100;
        this._uploadComplete = true;

      }
      if (promisesNextSet.length >0) {
        this.saveAll(promisesNextSet);
      }
    }).catch((e) => {
      console.log(e);
    });
    this.showLoadingSpinner = false;
  }
 
  handleDone() {
    this.isShowModal = false;
    this._disableSave = true;
    this._disableNextUpload = false;
    this._disableSubmit = false;
    this._hideUpload = true;
    this.progress = 0;

  }

}
