import SyntaxHighlighter from 'react-syntax-highlighter';
import { Modal } from 'react-bootstrap';
import { useSliceSelector, useSliceStore } from '../utils/reduxHelper';

function isNumber(value) {
  value = value ?? '';
  if(value.trim() === '') return false;
  return !isNaN(Number(value));
}

function genField(field, generatedClasses, framework){
  let fieldTypes = {
    INT: 'IntegerField',
    BOOL: 'BooleanField',
    BIGINT: 'BigIntegerField',
    FLOAT: 'FloatField',
    VARCHAR: 'CharField',
    TEXT: 'TextField',
    FILE: 'FileField',
    IMAGE: 'ImageField',
    DATE: 'DateField',
    DATETIME: 'DateTimeField',
    FOREIGN: 'ForeignKey',
    MANY_TO_MANY: 'ManyToManyField'
  };
  
  if(framework === 'PW'){
    fieldTypes['FOREIGN'] = 'ForeignKeyField';
    fieldTypes['IMAGE'] = 'CharField';
    fieldTypes['FILE'] = 'CharField';
  }

  const modelPrefix = framework === 'DJ' ? 'models.' : (framework === 'PW'? '': '');
  let fieldType = fieldTypes[field.type];

  let foreignClassGenerated;
  let foreignClass;
  
  if(field.linkedTable){
    foreignClass = field.linkedTable.substr(0,1).toUpperCase() + field.linkedTable.substr(1);
    foreignClassGenerated = generatedClasses.includes(foreignClass);
    if(framework === 'PW') {
      if(!foreignClassGenerated && fieldType === 'ForeignKey') {
        fieldType = 'DeferredForeignKey';
      }
      if(fieldType === 'ManyToManyField'){
        return;
      }
    }
  }

  let code = `${field.name} = ${modelPrefix}${fieldType}(`;
  
  if(fieldType === 'CharField') {
    let maxLength = field.maxLength

    if(framework === 'DJ') {
      maxLength = maxLength || 255;
    }

    if(framework === 'PW') {
      if(field.type === 'IMAGE' || field.type === 'FILE') {
        maxLength = 1024;
      }
    }

    if(maxLength) {
      code += `max_length=${maxLength}, `;
    }
  }
  
  if(field.linkedTable){
    if(!foreignClassGenerated) code += "'";
    code += `${foreignClass}`;
    if(!foreignClassGenerated) code += "'";
    code += ", ";
  }

  if(framework === 'DJ' && field.blank) {
    code += `blank=True, `;
  }

  if(field.null) {
    code += `null=True, `;
  }

  if(field.unique) {
    code += `unique=True, `;
  }

  if(field.type === 'FOREIGN') {
    if(framework === 'DJ') {
      code += "on_delete=models.PROTECT, ";
    }else if(framework === 'PW'){
      code += "on_delete=\"RESTRICT\"";
    }
  }

  if(field.uploadTo) {
    code += `upload_to='${field.uploadTo}', `;
  }

  if(field.defaultValue) {
    code += `default=`;
    const isNum = isNumber(field.defaultValue);
    if(!isNum) code += "'";
    code += `${field.defaultValue}`;
    if(!isNum) code += "'";
    code += ", ";
  }

  if(code.substr(code.length-2) === ', ') {
    code = code.substr(0, code.length-2);
  }

  code += ')'

  return code;
}

function genClass(table, generatedClasses, framework) {
  const className = table.name.substr(0,1).toUpperCase() + table.name.substr(1);
  const modelPrefix = framework === 'DJ' ? 'models.' : (framework === 'PW'? '': '');
  let code = `class ${className}(${modelPrefix}Model):\n`
  table.fields.filter(field => field.name !== 'id').forEach(field => {
    const fieldCode = genField(field, generatedClasses, framework);
    if(fieldCode) {
      code += '    ' + fieldCode + '\n';
    }
  });

  if(framework === 'PW'){
    code += '\n';
    code += `    class Meta:\n`;
    code += `        database = db\n`;
  }

  if(table.displayField){
    code += '\n';
    code += `    def __str__(self):\n`;
    code += `        return self.${table.displayField}\n`;
  }

  return code;
}

function genCode(tableList, framework) {
  if(!framework) return '';
  let code = '';
  if(framework === 'DJ') {
    code += "from django.db import models\n\n";
  }else if(framework === 'PW') {
    code += "from peewee import *\n"
    code += "db = MySQLDatabase(\n"
    code += "        'database_name',\n" 
    code += "        host='127.0.0.1',\n" 
    code += "        user='user_name',\n" 
    code += "        passwd='***',\n" 
    code += "        charset='utf8mb4'\n"
    code += ")\n\n"
  }
  let generatedClasses = [];

  tableList.filter(table => !table.isLinkThrough).forEach(table => {
    const className = table.name.substr(0,1).toUpperCase() + table.name.substr(1);
    code += genClass(table, generatedClasses, framework) + '\n';
    generatedClasses.push(className);
  });

  if(framework === 'PW'){
    tableList.forEach(table => {
      table.fields.filter(field => field.type === 'MANY_TO_MANY').forEach(field => {
        const className = table.name.substr(0,1).toUpperCase() + table.name.substr(1);
        const foreignClass = field.linkedTable.substr(0,1).toUpperCase() + field.linkedTable.substr(1);
        code += `class ${className}_${field.name}(Model):\n`;
        code += `    ${table.name} = ForeignKeyField(${className})\n`;
        code += `    ${field.linkedTable} = ForeignKeyField(${foreignClass})\n`;
        code += '\n';
        code += `    class Meta:\n`;
        code += `        database = db\n`;
      });
    });
  
    code += "\n"
    code += "db.connect()\n"
    code += "db.create_tables([\n"
    
    tableList.forEach(table => {
      if(table.isLinkThrough) return;
      const className = table.name.substr(0,1).toUpperCase() + table.name.substr(1);
      code += `    ${className},\n`

      table.fields.filter(field => field.type === 'MANY_TO_MANY').forEach(field => {
        code += `    ${className}_${field.name}, \n`;
      });
    });

    code += "])";
  }

  return code;
}

export default function CodeModal() {
  const store = useSliceStore('app');
  const [showCodeModal, tableList, framework] = useSliceSelector('app', 
        ['showCodeModal', 'tableList', 'framework']);


  function hide() {
    store.setState({
      showCodeModal: false
    });
  }

  let code = genCode(tableList ?? [], framework);
  
  function copyToClipBoard(){
    navigator.clipboard.writeText(code);
  }

  return (
    <Modal size="xl" show={showCodeModal} onHide={hide}>
      <Modal.Header closeButton>
        <Modal.Title>
          Generated models
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="row">
          <div className="col-4">
            <label className="mb-1">Framework:</label>
            <select value={framework??''} className="form-control"
              onChange={e => store.setState({framework: e.target.value})}
            >
              <option value="">----</option>
              <option value="DJ">Django</option>
              <option value="PW">Peewee</option>
            </select>
          </div>
          <div className="col-8">
            <label className="mb-1">&nbsp;</label>
            <br/>
            <button className="btn btn-success btn-sm float-end"
              onClick={copyToClipBoard}
            >
              <i className="fas fa-copy"></i> Copy to clipboard
            </button>
          </div>
        </div>
        <SyntaxHighlighter language="python" className="mt-3">
          {code}
        </SyntaxHighlighter>
      </Modal.Body>
      <Modal.Footer>
        <button className="btn btn-secondary" onClick={hide}>
          Close
        </button>
      </Modal.Footer>
    </Modal>
  )
}