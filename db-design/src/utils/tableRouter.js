export function getTableRoutes(targetTable, tableList) {
  tableList = tableList.filter(table => !table.isLinkThrough);
  if(!targetTable) return {};
  let tableRoutes = {[targetTable]: []};

  while(true) {
    let updated = false;
    let tableRouteNames = Object.keys(tableRoutes);
    let leftTables = tableList.filter(table => !tableRouteNames.includes(table.name));
    
    // category --> product
    leftTables.forEach(table => {
      table.fields.filter(field => tableRouteNames.includes(field.linkedTable)).forEach(field => {
        let route = tableRoutes[field.linkedTable];
        tableRoutes[table.name] = [...route, {colName: table.name, tableName: field.linkedTable}];
        updated = true;
      });
    });

    // product --> category
    tableRouteNames.map(tableName => tableList.find(t => t.name === tableName)).forEach(table => {
      
      table.fields.forEach(field => {
        if(!leftTables.find(t => t.name === field.linkedTable)){
          return;
        }
        let route = tableRoutes[table.name];
        tableRoutes[field.linkedTable] = [...route, {colName:field.name, tableName: table.name}];
        updated = true;
      });
    });
    
    if(!updated) break;
  }
  return tableRoutes;
}

function collectJoinTableNames(conditionList, accResult) {
  conditionList.forEach(condition => {

    if(condition.tableName && !accResult.includes(condition.tableName)){
      accResult.push(condition.tableName);
    }

    if(condition.children){
      collectJoinTableNames(condition.children, accResult);
    }
  })
}

export function getJoinTables(targetTable, tableList, tableRoutes, conditionList) {
  if(!targetTable) return [];

  let joinTableNames = [];
  collectJoinTableNames(conditionList, joinTableNames);
  let linkedTableNames = [];

  joinTableNames.forEach(tableName => {
    let route = tableRoutes[tableName];
    route.forEach(r => {
      if(!linkedTableNames.includes(r.tableName) && !joinTableNames.includes(r.tableName)){
        linkedTableNames.push(r.tableName);
      }
    });
  });
  
  joinTableNames = [...joinTableNames, ...linkedTableNames];
  joinTableNames = joinTableNames.filter(x => x !== targetTable);

  let joinTables = [tableList.find(t => t.name === targetTable)];
  let n = 0;
  while(joinTableNames.length > 0) {
    n += 1;
    if(n > 10)break;

    let nextTable;

    for(let i = 0; i < joinTableNames.length; i++){
      let tableName = joinTableNames[i];
      let table = tableList.find(t => t.name === tableName);
      for(let j = 0; j < table.fields.length; j++){
        let field = table.fields[j];
        if(field.linkedTable && joinTables.some(t => t.name === field.linkedTable)) {
          nextTable = table;
          if(field.type === 'MANY_TO_MANY'){
            joinTables.push(
              tableList.find(t => t.name === `${table.name}_${field.name}`)
            );
          }
          joinTables.push(nextTable);
          joinTableNames = joinTableNames.filter(x => x !== nextTable.name);
          break;
        }
      }
      if(nextTable) break;
    }

    nextTable = null;

    for(let i = 0; i < joinTables.length; i++) {
      let table = joinTables[i];
      for(let j = 0; j < table.fields.length; j++){
        let field = table.fields[j];
        if(field.linkedTable && joinTableNames.includes(field.linkedTable)){
          nextTable = tableList.find(t => t.name === field.linkedTable);
          if(field.type === 'MANY_TO_MANY'){
            joinTables.push(
              tableList.find(t => t.name === `${table.name}_${field.name}`)
            );
          }
          joinTables.push(nextTable);
          joinTableNames = joinTableNames.filter(x => x !== nextTable.name);
          break;
        }
      }
      if(nextTable) break;
    }
  }
  return joinTables.slice(1).filter(x => x);
}