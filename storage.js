function openDatabase() {
  return new Promise((resolve,reject)=>{
    const request = indexedDB.open('family-preparedness',1);
    request.onupgradeneeded = () => request.result.createObjectStore('household');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readHousehold() {
  const database = await openDatabase();
  return new Promise((resolve,reject)=>{
    const transaction=database.transaction('household','readonly');
    const request=transaction.objectStore('household').get('state');
    transaction.oncomplete=()=>{database.close();resolve(request.result);};
    transaction.onabort=()=>{database.close();reject(transaction.error);};
  });
}

async function writeHousehold(expected, data) {
  const database = await openDatabase();
  return new Promise((resolve,reject)=>{
    const transaction=database.transaction('household','readwrite');
    const store=transaction.objectStore('household');
    const prior=store.get('state');
    let result;
    prior.onsuccess=()=>{
      const existing=prior.result;
      if ((existing?.revision || 0) !== expected) {
        result={conflict:true, data:existing.data, revision:existing.revision};
        return;
      }
      result={data,revision:expected+1};
      store.put(result,'state');
    };
    transaction.oncomplete=()=>{database.close();resolve(result);};
    transaction.onabort=()=>{database.close();reject(transaction.error);};
  });
}

function validateBackup(backup) {
  const data=backup?.data;
  const object=value=>Boolean(value && typeof value==='object' && !Array.isArray(value));
  const text=value=>typeof value==='string';
  const date=value=>text(value) && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value));
  const validDate=value=>!value || date(value);
  const parts=['items','members','go_bags','bag_checklist','inventory_batches','history','home_stages','household_tasks','categories'];
  if (backup?.format!=='family-emergency-preparedness' || backup.version!==1 || !object(data) ||
      !parts.every(key=>Array.isArray(data[key])) || !object(data.settings)) return false;
  if (!date(data.settings.prep_start_on) || !date(data.settings.prep_end_on) ||
      !Number.isInteger(data.settings.home_goal_days) || data.settings.home_goal_days<=0 ||
      !Number.isFinite(data.settings.water_l_per_person_day) || data.settings.water_l_per_person_day<=0) return false;
  const uniquelyIdentified=key=>data[key].every(row=>object(row) && text(row.id) && row.id) &&
    new Set(data[key].map(row=>row.id)).size===data[key].length;
  if (!['items','members','go_bags','bag_checklist','inventory_batches','history','household_tasks'].every(uniquelyIdentified)) return false;
  const ids=key=>new Set(data[key].map(row=>row.id));
  const memberIds=ids('members'), itemIds=ids('items'), bagIds=ids('go_bags');
  return data.go_bags.some(bag=>!bag.archived) &&
    data.categories.every(text) &&
    data.members.every(member=>text(member.label) && member.label.trim()) &&
    data.items.every(item=>text(item.name) && text(item.category) && text(item.status)) &&
    data.go_bags.every(bag=>memberIds.has(bag.memberId) && text(bag.user_name) && ['adult','child'].includes(bag.member_type) && validDate(bag.walk_test_on)) &&
    data.bag_checklist.every(item=>bagIds.has(item.bag_id) && text(item.label) && text(item.requirement)) &&
    data.inventory_batches.every(batch=>itemIds.has(batch.item_id) && validDate(batch.expires_on) &&
      (!batch.rotation_pending || (object(batch.rotation_pending) && Number.isFinite(Date.parse(batch.rotation_pending.marked_at))))) &&
    data.history.every(record=>validDate(record.rotated_on) && (!record.completed_at || Number.isFinite(Date.parse(record.completed_at)))) &&
    data.home_stages.every(stage=>object(stage) && text(stage.label) && Number.isInteger(stage.days) && stage.days>0) &&
    data.household_tasks.every(task=>text(task.title) && text(task.acceptance) && text(task.priority));
}
