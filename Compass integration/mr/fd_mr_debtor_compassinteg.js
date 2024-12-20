/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 */
define(['N/https', 'N/search', 'N/record', 'N/format', 'N/runtime'],

    function(https,search,record,format,runtime) {
        const CREATEDBY = 'Compass';
        
        let createdRec = 0;
        let updatedRec = 0;

        const module = {}

        module.getInputData = () => {
            const DEBUG_IDENTIFIER = 'getInputData';

            try {

                return getDebtorsFromCompass()

            } catch (e) {
                log.audit({
                    title: e.name,
                    details: e.message
                });
            }
        }
    
        module.map = (context) => {
            const DEBUG_IDENTIFIER = 'map';

            try{
                // log.debug(DEBUG_IDENTIFIER, JSON.parse(context.value))
                const apiResponse = JSON.parse(context.value);
                const debtorCode = apiResponse.debtorCode;
                const debtorTitle = apiResponse.debtorTitle;
                let status = apiResponse.status;
                status = status == 'Active' ? false: true
                const parents = apiResponse.adults
                const students = apiResponse.students

                const objArr = {
                    debtorCode: debtorCode,
                    debtorTitle: debtorTitle,
                    status: status, 
                    parents: parents,
                    students: students
                }

                log.debug(DEBUG_IDENTIFIER, 'objArr: ' + JSON.stringify(objArr))
                
                context.write({
                    key: debtorCode,
                    value: objArr
                });

            } catch (e) {
                log.audit({
                    title: e.name,
                    details: e.message
                });
            }
        }
    

        module.reduce = (context) => {
            const DEBUG_IDENTIFIER = 'reduce';

            try{
                // log.debug(DEBUG_IDENTIFIER, JSON.stringify(context))

                const debtorCode = context.key
                const debtorObj = JSON.parse(context.values)

                // log.debug(DEBUG_IDENTIFIER, 'debtorCode: ' + debtorCode)
                // log.debug(DEBUG_IDENTIFIER, 'debtorObj keys: ' + Object.keys(debtorObj))

                const externalIdArr = [debtorCode]

                log.debug(DEBUG_IDENTIFIER, 'externalIds: ' + externalIdArr)

                const customerSearchObj = search.create({
                    type: "customer",
                    filters: [
                        ['externalid', 'anyof', externalIdArr]
                    ],
                    columns:
                    [
                       search.createColumn({name: "internalid", label: "Internal ID"}),
                       search.createColumn({name: "externalid", label: "External ID"})
                    ]
                });

                let existDebtors = new Array()
                let objexistDebtors = {};
                
                customerSearchObj.run().each(function(result){
                    const internalId = result.getValue({name: 'internalid'})||null;
                    const externalId = result.getValue({name: 'externalid'})||null;

                    if(!isNullOrEmpty(externalId)){
                        if (externalIdArr.includes(externalId)) {
                            existDebtors.push(externalId);
                            if (objexistDebtors[externalId] == null) {
                                objexistDebtors[externalId] = {
                                    internalid: internalId
                                };
                            }
                        }
                    }

                    return true;
                });

                log.debug(DEBUG_IDENTIFIER, 'existDebtors: ' + existDebtors)
                log.debug(DEBUG_IDENTIFIER, 'objexistDebtors: ' + JSON.stringify(objexistDebtors))

                try{
                    const debtorTitle = debtorObj.debtorTitle
                    const status = debtorObj.status
                    const parents = debtorObj.parents
                    const students = debtorObj.students

                    // get parents netsuite record
                    let parentsArr = contactSearch(parents)

                    log.debug(DEBUG_IDENTIFIER, 'parentsExternalId: ' + parents)
                    log.debug(DEBUG_IDENTIFIER, 'parents netsuite record: ' + parentsArr)

                    let studentArr = new Array()
                    let feeProportion
                    for(let student in students){
                        const studentId = students[student].compassPersonId
                        feeProportion = students[student].feeProportion
                        studentArr.push(studentId)
                    }
                    log.debug(DEBUG_IDENTIFIER, 'students externalId: ' + studentArr)

                    // get students netsuite record
                    studentArr = contactSearch(studentArr)
                    log.debug(DEBUG_IDENTIFIER, 'studentArr: ' + studentArr)

                    let recordId
                    if (existDebtors.includes(debtorCode)) {
                        recordId = objexistDebtors[debtorCode].internalid;

                        // update debtor record
                        updateDebtors(recordId,debtorCode,debtorTitle,status,parentsArr,studentArr,feeProportion);
                        updatedRec++
                    } else {

                        // create debtor record
                        recordId = createDebtors(debtorCode,debtorTitle,status,parentsArr,studentArr,feeProportion);
                        createdRec++
                    }

                    const contactsArr = parentsArr.concat(studentArr)
                    for(let i in contactsArr){
                        record.submitFields({
                            type: 'contact',
                            id: contactsArr[i],
                            values: {
                                'company' : recordId
                            }
                        });
                    }
                } catch (e) {
                    log.audit({
                        title: e.name,
                        details: e.message
                    });

                    createErrorResRecord({
                        recordId: debtorCode,
                        stringObject: debtorObj,
                        errorMessage: e.message,
                        recordType: 'Debtor',
                    });
                }

                createSyncReport({
                    recType: 'debtor',
                    createdRec: createdRec,
                    updatedRec: updatedRec,
                    totalRec: createdRec + updatedRec,
                });
                
            } catch (e) {
                log.audit({
                    title: e.name,
                    details: e.message
                });
            }
        }
    
    
        module.summarize = (summary) => {
            summary.usage;

            log.audit({
                title: 'Usage',
                details: summary.usage
            });
            log.audit({
                title: 'Concurrency',
                details: summary.concurrency
            });
            log.audit({
                title: 'Yields',
                details: summary.yields
            });
        }

        const getDebtorsFromCompass = () => {
            const DEBUG_IDENTIFIER = 'getDebtors'

            const headerObj = { 
                'CompassApiKey': '04b5e673-4584-4e49-a63f-7f07e0b8b7e9',
                'Content-Type' : 'application/json'
            };

            const getDebtors = https.post({
                url: 'https://stedwards-nsw.compass.education/api/reference/v1/GetDebtors',
                body: '',
                headers: headerObj
            })

            // log.debug(DEBUG_IDENTIFIER, 'getDebtors: ' + getDebtors.body)

            const responseBody = JSON.parse(getDebtors.body)
            const objDebtors = responseBody.d

            // log.debug(DEBUG_IDENTIFIER, objDebtors)

            return objDebtors
        }

        const contactSearch = (externalid) => {
            const contactSearchObj = search.create({
                type: "contact",
                filters: 
                [
                    ['externalid', 'anyof', externalid]
                ],
                columns:
                [
                    search.createColumn({name: "internalid"}),
                    search.createColumn({name: "entityid"}),
                    search.createColumn({name: "externalid"}),
                    search.createColumn({name: "custentity_status"})
                ]
            }); 

            let contactArr = new Array()
            contactSearchObj.run().each(function(result){
                const internalId = result.getValue({name: 'internalid'})||null;
                // const entityId = result.getValue({name: 'entityid'})||null;
                // const externalId = result.getValue({name: 'externalid'})||null;
                // const status = result.getValue({name: 'custentity_status'})||null;
                // const statusText = result.getText({name: 'custentity_status'})||null;

                // const contactObj = {
                //     internalId: internalId,
                //     entityId: entityId,
                //     externalId: externalId,
                //     status: status,
                //     statusText: statusText
                // }

                contactArr.push(internalId)

                return true;
            });

            return contactArr

        }
        
        const createDebtors = (debtorCode,debtorTitle,status,parentsArr,studentArr,feeProportion) => {
            const DEBUG_IDENTIFIER = 'createDebtors';
            const debRecord = record.create({
                type: record.Type.CUSTOMER,
                isDynamic: true
            });
            debRecord.setValue({ fieldId: 'externalid', value: debtorCode});
            debRecord.setValue({ fieldId: 'entityid', value: debtorCode + ' - ' + debtorTitle});
            debRecord.setValue({ fieldId: 'companyname', value: debtorTitle});
            debRecord.setValue({ fieldId: 'custentity_fee_proportion', value: feeProportion});
            debRecord.setValue({ fieldId: 'custentity_fam_cde', value: debtorCode});
            debRecord.setValue({ fieldId: 'isinactive', value: status});
            debRecord.setValue({ fieldId: 'custentity_ste_created_by', value: CREATEDBY});

            const debRecId = debRecord.save({ignoreMandatoryFields: true});
            log.debug(DEBUG_IDENTIFIER, 'Submitted record: ' + debRecId);

            const contactsArr = parentsArr.concat(studentArr)
            if(!isNullOrEmpty(contactsArr)){
                for(let contact in contactsArr){
                    record.attach({
                        record: {
                            type: record.Type.CONTACT,
                            id: contactsArr[contact]
                        },
                        to: {
                            type: record.Type.CUSTOMER,
                            id: debRecId
                        }
                    });
                }
            }
        }
        
        const updateDebtors = (recordId,debtorCode,debtorTitle,status,parentsArr,studentArr,feeProportion) => {
            const DEBUG_IDENTIFIER = 'updateDebtors';
            const debRecord = record.load({
                type: record.Type.CUSTOMER, 
                id: recordId
            });
            debRecord.setValue({ fieldId: 'externalid', value: debtorCode});
            debRecord.setValue({ fieldId: 'entityid', value: debtorCode + ' - ' + debtorTitle});
            debRecord.setValue({ fieldId: 'companyname', value: debtorTitle});
            debRecord.setValue({ fieldId: 'custentity_fee_proportion', value: feeProportion});
            debRecord.setValue({ fieldId: 'custentity_fam_cde', value: debtorCode});
            debRecord.setValue({ fieldId: 'isinactive', value: status});
            debRecord.setValue({ fieldId: 'custentity_ste_created_by', value: CREATEDBY});

            const debRecId = debRecord.save({ignoreMandatoryFields: true});
            log.debug(DEBUG_IDENTIFIER, 'Submitted record: ' + debRecId);

            const contactsArr = parentsArr.concat(studentArr)
            if(!isNullOrEmpty(contactsArr)){
                for(let contact in contactsArr){
                    record.attach({
                        record: {
                            type: record.Type.CONTACT,
                            id: contactsArr[contact]
                        },
                        to: {
                            type: record.Type.CUSTOMER,
                            id: debRecId
                        }
                    });
                }
            }
        }

        const createErrorResRecord = (objParams) => {
            const DEBUG_IDENTIFIER = 'createErrorResRecord';
        
            const recErrorRes = record.create({
                type: 'customrecord_ste_record_error'
            });
            recErrorRes.setValue({ fieldId: 'custrecord_ste_iwise', value: objParams.recordId.toString()});
            recErrorRes.setValue({ fieldId: 'custrecord_record_type', value: objParams.recordType});
            recErrorRes.setValue({ fieldId: 'custrecord_ste_iwise_error', value: objParams.errorMessage});
            recErrorRes.setValue({ fieldId: 'custrecord_iwise_json_object', value: objParams.stringObject});
        
            const errorResId = recErrorRes.save({ignoreMandatoryFields:  true});
            log.audit(DEBUG_IDENTIFIER, 'Submitted error resolution record ' + errorResId);
        }

        const createSyncReport = (objParams) => {
            const DEBUG_IDENTIFIER = 'createSyncReport';
            const recordType = objParams.recType;
            const totalRecords = objParams.totalRec;
            const numOfCreatedRecords = objParams.createdRec;
            const numOfUpdatedRecords = objParams.updatedRec;
        
            var details = numOfCreatedRecords + ' ' + recordType + ' out of ' + totalRecords + ' created.\n' + numOfUpdatedRecords + ' ' + recordType + ' out of ' + totalRecords + ' updated.';
        
            const syncReport = record.create({ type: 'customrecord_ste_iwise_sync_report'});
            syncReport.setValue({fieldId: 'custrecord_ste_sync_rep_details', value: details});
            syncReport.setValue({fieldId: 'custrecord_ste_sync_record_type', value: recordType[0].toUpperCase() + recordType.slice(1)});
            const syncReportId = syncReport.save({ignoreMandatoryFields:  true});
            log.debug(DEBUG_IDENTIFIER, 'Submitted sync report record: ' + syncReportId);
        }
        
        const isNullOrEmpty = objVariable => {
            return (objVariable == null || objVariable == "" || objVariable == undefined || objVariable == 'undefined' || objVariable == 0);
        };
    
        return module;
        
    });
    