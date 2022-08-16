import SyntaxHighlighter from 'react-syntax-highlighter';
import { Modal } from 'react-bootstrap';
import { useSliceSelector, useSliceStore } from '../utils/reduxHelper';
import { getTableRoutes, getJoinTables } from "utils/tableRouter";

function isValidCondition(condition) {
  const cond = condition.cond;
  const children = (condition.children ?? []).filter(isValidCondition);
  if(!cond) return false;

  if(cond === 'NOT'){
    if(children.length !== 1) {
      return false;
    }else{
      return isValidCondition(children[0]);
    }
  }

  if((cond === 'AND' || cond === 'OR')){
    if(children.length === 0){
      return false;
    }else{
      return children.every(isValidCondition);
    }
  }
  
  if(condition.fieldCustom) {
    return condition.expression;
  }else{
    return condition.tableName && condition.colName;
  }
}

function genConditionDJ(targetTable, tableRoutes, condition, indent) {
  if((condition.cond === 'AND' || condition.cond === 'OR') && condition.children) {
    let st = `(\n`;
    const children = condition.children.filter(isValidCondition);
    let symbol = {AND: '&', OR: '|'}[condition.cond];

    for(let i = 0; i < children.length; i++) {
      
      if(i === 0) st += indent + '    ';

      if(!['AND', 'OR', 'NOT'].includes(children[i].cond)) {
        st += "Q(";
      }

      st += genConditionDJ(targetTable, tableRoutes, children[i], indent + "    ");

      if(!['AND', 'OR', 'NOT'].includes(children[i].cond)) {
        st += ")";
      }

      if(i+1 < children.length) st += ` ${symbol}\n${indent}    `;
    }
    st += `\n${indent})`;
    return st;
  }

  if(condition.cond === 'NOT'){
    let st ='~Q';
    condition = condition.children[0];
    if(condition.cond !== 'AND' && condition.cond !== 'OR'){
      st += '(';
    }

    st += genConditionDJ(targetTable, tableRoutes, condition, indent + "    ");

    if(condition.cond !== 'AND' && condition.cond !== 'OR'){
      st += `)`;
    }
    return st;
  }

  let value = condition.value ?? '';
  
  let ops = {
    EQ: '',
    LT: '__lt',
    LTE: '__lte',
    GT: '__gt',
    GTE: '__gte',
    IS_NULL: '__isnull',
    IN: '__in',
    CT: '__icontains',
    SW: '__istartswith',
    EW: '__iendswith'
  }
  
  if(ops[condition.cond] !== undefined){
    let route = tableRoutes[condition.tableName];
    route = [...route.map(r => r.colName), condition.colName];
    return `${route.join('__')}${ops[condition.cond]}=${value}`
  }

  return '';
}

function genQueryDJ(targetTable, tableRoutes, conditionList) {
  if(!targetTable){
    return '';
  }

  let className = targetTable.substr(0,1).toUpperCase() + targetTable.substr(1);
  let query = 'from django.db.models import Q\n\n';
  query += `${targetTable}_list = ${className}.objects.all()\n`;
  
  conditionList.filter(isValidCondition).forEach(condition => {
    query += `${targetTable}_list = ${targetTable}_list.filter`;

    if(!["AND", "OR"].includes(condition.cond)) query += '(';
    
    query +=  `${genConditionDJ(targetTable, tableRoutes, condition, "")}`;

    if(!["AND", "OR"].includes(condition.cond)) query += ')';
    query += '\n';
  });

  return query;
}

function genConditionPW(condition, indent){
  if((condition.cond === 'AND' || condition.cond === 'OR') && condition.children) {
    let st = `(\n`;
    const children = condition.children.filter(isValidCondition);
    let symbol = {AND: '&', OR: '|'}[condition.cond];

    for(let i = 0; i < children.length; i++) {
      
      if(i === 0) st += indent + '    ';
      const needBracket = !['AND', 'OR', 'NOT','CT', 'EW', 'SW', 'IS_NULL'].includes(children[i].cond);
      
      if(needBracket) st += '('
      st += genConditionPW(children[i], indent + "    ");
      if(needBracket) st += ')'

      if(i+1 < children.length) st += ` ${symbol}\n${indent}    `;
    }
    st += `\n${indent})`;
    return st;
  }

  if(condition.cond === 'NOT'){
    let st ='~';
    condition = condition.children[0];
    if(condition.cond !== 'AND' && condition.cond !== 'OR'){
      st += '(';
    }

    st += genConditionPW(condition, indent + "    ");

    if(condition.cond !== 'AND' && condition.cond !== 'OR'){
      st += `)`;
    }
    return st;
  }

  let value = condition.value ?? '';
  
  let ops = {
    EQ: '==',
    LT: '<',
    LTE: '<=',
    GT: '>',
    GTE: '>=',
    IS_NULL: '.is_null',
    IN: '<<',
    CT: '.contains',
    SW: '.startswith',
    EW: '.endswith'
  }
  
  let op = ops[condition.cond]
  if(op){
    const className = condition.tableName.substr(0,1).toUpperCase() + condition.tableName.substr(1);
    let st = '';
    if(op[0] !== '.') {
      st += `${className}.${condition.colName} ${op} ${value}`;
    }else{
      st += `${className}.${condition.colName}${op}(${value})`;
    }
    return st;
  }

  return '';
}

function genQueryPW(targetTable, tableList, tableRoutes, conditionList) {
  if(!targetTable){
    return '';
  }

  conditionList = conditionList.filter(isValidCondition);
  let joinTables = getJoinTables(targetTable, tableList, tableRoutes, conditionList);
  let className = targetTable.substr(0,1).toUpperCase() + targetTable.substr(1);
  let query = '';
  

  console.log('joinTables=', joinTables);

  if(joinTables.length > 0) {
    query += `${targetTable}_list = (\n`
    query += `  ${className}.select()\n`;
    joinTables.forEach(t => {
      const joinClassName = t.name.substr(0,1).toUpperCase() + t.name.substr(1);
      query += `    .join(${joinClassName})\n`
    });
    query += ')\n'
  }else{
    query += `${targetTable}_list = ${className}.select()\n`;
  }

  conditionList.forEach(condition => {
    query += `${targetTable}_list = ${targetTable}_list.where`;

    if(!["AND", "OR"].includes(condition.cond)) query += '(';
    query +=  `${genConditionPW(condition, "")}`;
    if(!["AND", "OR"].includes(condition.cond)) query += ')';
    query += '\n';
  });

  return query;
}

export default function CodeModal() {
  const store = useSliceStore('app');

  let [
    showQueryCodeModal, 
    targetTable, 
    tableList, 
    conditionList, 
    framework
  ] = useSliceSelector('app', [
    'showQueryCodeModal', 
    'targetTable', 
    'tableList', 
    'conditionList', 
    'framework'
  ]);

  function hide() {
    store.setState({
      showQueryCodeModal: false
    });
  }

  targetTable = targetTable ?? '';
  tableList = tableList ?? [];
  conditionList = conditionList ?? [];
  let tableRoutes = getTableRoutes(targetTable, tableList);

  let code;
  if(framework === 'DJ'){
    code = genQueryDJ(targetTable,  tableRoutes, conditionList)
  }else if(framework === 'PW'){
    code = genQueryPW(targetTable, tableList, tableRoutes, conditionList)
  }
  
  function copyToClipBoard(){
    navigator.clipboard.writeText(code);
  }

  return (
    <Modal size="xl" show={showQueryCodeModal} onHide={hide}>
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