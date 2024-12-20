/**
 * 
 *  Version    Date             Author           Remarks
 *  1.00       Oct 23, 2024     Randle Gamboa    Initial Draft.
 *  
 * 
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @NModuleScope SameAccount
 */

define(['N/https', 'N/search', 'N/record', 'N/format'],

    function(https,search,record,format) {
        
        const CREATEDBY = 'Compass';
        const headerObj = { 
            'CompassApiKey': '04b5e673-4584-4e49-a63f-7f07e0b8b7e9',
            'Content-Type' : 'application/json'
        };

        const module = {}
        
        module.execute = (scriptContext) => {
            let DEBUG_IDENTIFIER = 'execute';
            log.debug(DEBUG_IDENTIFIER, '-- START --');
            
            try{
                const customerSearchObj = search.create({
                    type: "customer",
                    filters: [],
                    columns:
                    [
                       search.createColumn({name: "internalid", label: "Internal ID"}),
                       search.createColumn({name: "externalid", label: "External ID"})
                    ]
                });

                const result_set = customerSearchObj.run();
                let current_range = result_set.getRange({
                    start : 0,
                    end : 1000
                });

                let i = 0;  // iterator for all search results
                let j = 0;  // iterator for current result range 0..999

                const existDebtors = new Array()
                const objexistDebtors = {};
                
                while (j < current_range.length){
                    const result = current_range[j];
                    const internalID = result.getValue(result_set.columns[0])||null;
                    const externalID = result.getValue(result_set.columns[1])||null;

                    if (!isNullOrEmpty(externalID)) {
                        existDebtors.push(externalID);
        
                        if (objexistDebtors[externalID] == null) {
                            objexistDebtors[externalID] = {
                                internalid: internalID,
                            };
                        }
                    }
            
                    i++; j++;
                    if( j==1000 ) {   // check if it reaches 1000
                        j=0;          // reset j and reload the next portion
                        current_range = result_set.getRange({
                            start : i,
                            end : i+1000
                        });
                    }
                }
                
                log.debug(DEBUG_IDENTIFIER, 'existDebtors: ' + existDebtors)
                log.debug(DEBUG_IDENTIFIER, 'objexistDebtors: ' + JSON.stringify(objexistDebtors))
                
                const getDebtors = https.post({
                    url: 'https://stedwards-nsw.compass.education/api/reference/v1/GetDebtors',
                    body: '',
                    headers: headerObj
                })

                // log.debug(DEBUG_IDENTIFIER, 'getDebtors: ' + getDebtors.body)

                const responseBody = JSON.parse(getDebtors.body)
                const objDebtors = responseBody.d
                let createdRec = 0;
                let updatedRec = 0;

                log.debug(DEBUG_IDENTIFIER, 'total record pulled: ' + objDebtors.length)

                if (!isNullOrEmpty(objDebtors.length)) {
                    for (let x in objDebtors) {
                        log.debug(DEBUG_IDENTIFIER, 'recordObj: ' + JSON.stringify(objDebtors[x]))
                        const debtorCode = objDebtors[x].debtorCode;
                        const debtorTitle = objDebtors[x].debtorTitle;
                        let status = objDebtors[x].status;
                        status = status == 'Active' ? true: false
                        // const Schedule_type = objDebtors[x].paymentArrangementInterval;
                        // var Schedule_Amount = objDebtors[x].Schedule_Amount;

                        // const strDateStart = objDebtors[x].paymentIntervalStartDate;
                        // const strDateEnd = objDebtors[x].paymentIntervalEndDate;
                        // const objDateStart = strDateStart ? new Date(strDateStart.replace(/-/g, '/')) : strDateStart;
                        // const objDateEnd = strDateEnd ? new Date(strDateEnd.replace(/-/g, '/')) : strDateEnd;

                        // const Schedule_start = format.format({value: objDateStart, type: format.Type.DATE})
                        // const Schedule_end = format.format({value: objDateEnd, type: format.Type.DATE})
                        // log.debug(DEBUG_IDENTIFIER, 'strDateStart: ' + strDateStart + ' strDateEnd: ' + strDateEnd);
                        // log.debug(DEBUG_IDENTIFIER, 'objDateStart: ' + objDateStart + 'objDateEnd: ' + JSON.stringify(nlapiDateToString(objDateEnd)));

                        if (contains(existDebtors, debtorCode)) {
                            // if (!onDemand) {
                            const InternalId = objexistDebtors[debtorCode].internalid;
                            updateDebtors(InternalId,debtorCode,debtorTitle,status);
                            updatedRec++;
                            // }
                        } else {
                            createDebtors(debtorCode,debtorTitle,status);
                            createdRec++;
                        }
                    }
                }
            }catch(e){
                log.audit({
                    title: e.name,
                    details: e.message
                });	
            }

            log.debug(DEBUG_IDENTIFIER, '-- END --');
        }
        
        const createDebtors = (debtorCode,debtorTitle,status) => {
            const DEBUG_IDENTIFIER = 'createDebtors';
            const debRecord = record.create({
                type: record.Type.CUSTOMER,
                isDynamic: true
            });
            debRecord.setValue({ fieldId: 'externalid', value: debtorCode});
            debRecord.setValue({ fieldId: 'entityid', value: debtorCode + ' - ' + debtorTitle});
            debRecord.setValue({ fieldId: 'companyname', value: debtorTitle});
            debRecord.setValue({ fieldId: 'custentity_fam_cde', value: debtorCode});
            debRecord.setValue({ fieldId: 'isinactive', value: status});
            debRecord.setValue({ fieldId: 'custentity_ste_created_by', value: CREATEDBY});

            const debRecId = debRecord.save({ignoreMandatoryFields: true});
            log.debug(DEBUG_IDENTIFIER, 'Submitted record: ' + debRecId);
        }
        
        const updateDebtors = (InternalId,debtorCode,debtorTitle,status) => {
            const DEBUG_IDENTIFIER = 'updateDebtors';
            const debRecord = record.load({
                type: record.type.CUSTOMER, 
                id: InternalId
            });
            debRecord.setValue({ fieldId: 'externalid', value: debtorCode});
            debRecord.setValue({ fieldId: 'companyname', value: debtorTitle});
            debRecord.setValue({ fieldId: 'custentity_fam_cde', value: debtorCode});
            debRecord.setValue({ fieldId: 'isinactive', value: status});
            debRecord.setValue({ fieldId: 'custentity_ste_created_by', value: CREATEDBY});

            const debRecId = debRecord.save({ignoreMandatoryFields: true});
            log.debug(DEBUG_IDENTIFIER, 'Submitted record: ' + debRecId);
        }

        const contains = (arr, val) => {
            for (var i = 0; i < arr.length; i++) {
                if (arr[i] === val) {
                    return true;
                }
            }
            return false;
        }

        const isNullOrEmpty = objVariable => {
            return (objVariable == null || objVariable == "" || objVariable == undefined || objVariable == 'undefined' || objVariable == 0);
        };

        return module;
        
    });
    