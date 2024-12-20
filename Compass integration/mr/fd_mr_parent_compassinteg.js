/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 */
define(['N/https', 'N/search', 'N/record', 'N/format', 'N/runtime'],

    function(https,search,record,format,runtime) {
        const CREATEDBY = 'Compass';
        const headerObj = { 
            'CompassApiKey': '04b5e673-4584-4e49-a63f-7f07e0b8b7e9',
            'Content-Type' : 'application/json'
        };

        let createdRec = 0;
        let updatedRec = 0;

        const statusObj = {
            'Accepted': 1,	 
            'Waitlist':	2,	 
            'Info': 	3,	 
            'Graduated':4,	 
            'Follow Up':5,	 
            'Cancelled':6,	 
            'Attending':7,	 
            'Sibling':	8,	 
            'Offered':	9,	 
            'Left':     10,	 
            'Declined':	12,	 
            'N/A':  	11,	 
            'Active':	13,	 
            'Undefined':14,	 
            'Future':	15,	 
            'Left': 	16,	 
            'On-Hold':  17,	 
            'Locked':	18
        }
        
        const module = {}

        module.getInputData = () => {
            const DEBUG_IDENTIFIER = 'getInputData';

            try {

                const getFutureParents = runtime.getCurrentScript().getParameter('custscript_xw_getfutureparents');
                return getParentsFromCompass(getFutureParents)

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
                const getFutureParents = runtime.getCurrentScript().getParameter('custscript_xw_getfutureparents');
                // log.debug(DEBUG_IDENTIFIER, JSON.parse(context.value))
                const apiResponse = JSON.parse(context.value);
                const status = apiResponse.parentDetails[0].status
                let identifier = apiResponse.govtCode1
                // identifier = identifier.replace('PP','co_')
                const externalid = apiResponse.compassPersonId
                const debtorId = getDebtorsFromCompass(externalid)
                const title = apiResponse.title
                const firstName = apiResponse.firstName
                const middleName = apiResponse.middleName
                const lastName = apiResponse.lastName
                const role = apiResponse.relationships.type
                const phone = apiResponse.homePhoneNumber
                const mobilephone = apiResponse.mobileNumber
                const isStudent = false
                const gender = apiResponse.gender
                const email = apiResponse.emailAddress
                const receivestatement = true
                const addr1 = apiResponse.addresses[0].addressLine1
                const addr2 = apiResponse.addresses[0].addressLine1
                const city = apiResponse.addresses[0].suburb
                const zip = apiResponse.addresses[0].postcode
                const country = apiResponse.addresses[0].country

                const objArr = {
                    status: status,
                    externalid: externalid,
                    debtorId: debtorId,
                    title: title,
                    firstName: firstName, 
                    middleName: middleName,
                    lastName: lastName, 
                    role: role,
                    phone: phone,
                    mobilephone: mobilephone,
                    isStudent: isStudent,
                    gender: gender,
                    email: email,
                    receivestatement: receivestatement,
                    addr1: addr1,
                    addr2: addr2,
                    city: city,
                    zip: zip,
                    country: country
                }

                //-- if m/r is run to get future parents
                if(getFutureParents == true){
                    if(status == 'Future' ){
                        log.debug(DEBUG_IDENTIFIER, 'future parents objArr: ' + JSON.stringify(objArr))

                        context.write({
                            key: identifier,
                            value: objArr
                        });
                    }
                }else{
                    log.debug(DEBUG_IDENTIFIER, 'parents objArr: ' + JSON.stringify(objArr))

                    context.write({
                        key: identifier,
                        value: objArr
                    });
                }

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
                const expiryDays = getExpiryDays()
                const item = runtime.getCurrentScript().getParameter('custscript_xw_parents_enrolitem')
                // log.debug(DEBUG_IDENTIFIER, JSON.stringify(context))

                const identifier = context.key
                const parent = JSON.parse(context.values)

                // log.debug(DEBUG_IDENTIFIER, 'identifier: ' + identifier)
                // log.debug(DEBUG_IDENTIFIER, 'parent keys: ' + Object.keys(parent))

                // const externalIdArr = [identifier,parent.externalid]

                // log.debug(DEBUG_IDENTIFIER, 'externalIds: ' + externalIdArr)

                const contactSearchObj = search.create({
                    type: "contact",
                    filters: 
                    [
                        ["custentity_iwise_int_id","is",identifier]
                    ],
                    columns:
                    [
                        search.createColumn({name: "internalid"}),
                        search.createColumn({name: "entityid"}),
                        search.createColumn({name: "externalid"}),
                        search.createColumn({name: "custentity_status"}),
                        search.createColumn({name: "custentity_iwise_int_id"})
                    ]
                });

                let existContacts = new Array();
                let objexistContacts = {};
                
                contactSearchObj.run().each(function(result){
                    const internalId = result.getValue({name: 'internalid'})||null;
                    const entityId = result.getValue({name: 'entityid'})||null;
                    const externalId = result.getValue({name: 'externalid'})||null;
                    const status = result.getValue({name: 'custentity_status'})||null;
                    const statusText = result.getText({name: 'custentity_status'})||null;
                    const iwiseId = result.getValue({name: 'custentity_iwise_int_id'})||null;

                    if(!isNullOrEmpty(identifier)){
                        if (identifier == iwiseId) {
                            existContacts.push(iwiseId);
                            if (objexistContacts[iwiseId] == null) {
                                objexistContacts[iwiseId] = {
                                    internalid: internalId,
                                    status: status,
                                    statusName: statusText,
                                };
                            }
                        }
                    }

                    return true;
                });

                log.debug(DEBUG_IDENTIFIER, 'existContacts: ' + existContacts)
                log.debug(DEBUG_IDENTIFIER, 'objexistContacts: ' + JSON.stringify(objexistContacts))

                let Contact_Id;
                let stringObject;
                let objContactsMap = {};
                let objSOs = {};
                try {
                    const status = parent.status
                    const externalid = parent.externalid
                    const debtorId = parent.debtorId
                    const title = parent.title
                    const firstName = parent.firstName
                    const middleName = parent.middleName
                    const lastName = parent.lastName
                    const role = parent.role
                    const phone = parent.phone
                    const mobilephone = parent.mobilephone
                    const isStudent = parent.isStudent
                    const gender = parent.gender
                    const email = parent.email
                    const receivestatement = parent.receivestatement
                    const addr1 = parent.addr1
                    const addr2 = parent.addr2 
                    const city = parent.city
                    const zip = parent.zip
                    const country = parent.country
                    
                    stringObject = parent
                    Contact_Id = externalid

                    if(isNullOrEmpty(debtorId)){
                        log.debug(DEBUG_IDENTIFIER, 'parent - ' + externalid + ' has no debtor')
                    }

                    if (!isNullOrEmpty(existContacts)) {
                        log.debug(DEBUG_IDENTIFIER, 'Update: ' + firstName);

                        const internalId = objexistContacts[existContacts[0]].internalid

                        updateContacts(internalId,externalid,debtorId,title,firstName,middleName,lastName,role,phone,mobilephone,isStudent,gender,email,receivestatement,addr1,addr2,city,zip,country);
                        updatedRec++;

                        //-- CREATE OBJECT IF PARENT STATUS IS 'FUTURE'
                        if (status == 'Future') {
                            if (!objSOs[Contact_Id]) {
                                objSOs[Contact_Id] = {};
                            }

                            objSOs[Contact_Id].status = 'Future';

                            objContactsMap[Contact_Id] = {};
                            objContactsMap[Contact_Id].id = internalId;
                            objContactsMap[Contact_Id].debtor = debtorId;
                        }

                    } else {
                        log.debug(DEBUG_IDENTIFIER, 'Create record: ' + firstName);

                        const internalId = createContacts(externalid,debtorId,title,firstName,middleName,lastName,role,phone,mobilephone,isStudent,gender,email,receivestatement,addr1,addr2,city,zip,country);
                        createdRec++;

                        //-- CREATE OBJECT IF PARENT STATUS IS 'FUTURE'
                        if (status == 'Future') {
                            if (!objSOs[Contact_Id]) {
                                objSOs[Contact_Id] = {};
                            }

                            objSOs[Contact_Id].status = 'Future';

                            objContactsMap[Contact_Id] = {};
                            objContactsMap[Contact_Id].id = internalId;
                            objContactsMap[Contact_Id].debtor = debtorId;
                        }
                    }
                } catch (e) {
                    log.audit({
                        title: e.name,
                        details: e.message
                    });	

                    createErrorResRecord({
                        recordId: Contact_Id ? Contact_Id.toString() : Contact_Id,
                        stringObject: stringObject,
                        // CompanyId: CompanyId ? CompanyId.toString() : CompanyId,
                        errorMessage: e.message,
                        recordType: 'Contact',
                    });
                }

                
                //-- CREATE SO/ENROLMENT OFFER IS PARENT STATUS IS FUTURE
                if (Object.keys(objSOs).length > 0) {
                    log.debug(DEBUG_IDENTIFIER, 'objSOs: ' + JSON.stringify(objSOs))
                    log.debug(DEBUG_IDENTIFIER, 'objContactsMap: ' + JSON.stringify(objContactsMap))

                    updateCreateSORecord({
                        objSOs: objSOs,
                        objContactMap: objContactsMap,
                        enrollItem: item,
                        expiryDays: expiryDays,
                        sendEmail: false
                    });
                }

                context.write({
                    key: createdRec,
                    value: updatedRec
                });
                
            } catch (e) {
                log.audit({
                    title: e.name,
                    details: e.message
                });
            }
        }
    
        module.summarize = (summary) => {
            const DEBUG_IDENTIFIER = 'summary'

            let totalCreated = 0
            let totalUpdated = 0
            summary.output.iterator().each(function(key, value) {
                totalCreated = key
                totalUpdated = value
                return true;
            });

            log.debug(DEBUG_IDENTIFIER,'total created: ' + totalCreated)
            log.debug(DEBUG_IDENTIFIER,'total updated: ' + totalUpdated)


            createSyncReport({
                recType: 'contact',
                createdRec: totalCreated,
                updatedRec: totalUpdated, 
                totalRec: Number(totalCreated) + Number(totalUpdated),
            });

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

        const getParentsFromCompass = (getFutureParents) => {
            const DEBUG_IDENTIFIER = 'getParents'
            
            let firstDate
            let lastDate
            let modifiedDate
            if(!getFutureParents){
                log.debug(DEBUG_IDENTIFIER, 'Getting Parents')
                const getFirstAndLastDateOfCurrentYear = () =>{
                    const currentYear = new Date().getFullYear();
                    const firstDate = new Date(currentYear, 0, 1);  // January 1st
                    const lastDate = new Date(currentYear, 11, 31);  // December 31st
                    return { 
                        firstDate: firstDate.toISOString(), 
                        lastDate: lastDate.toISOString()  
                    };
                }
                
                const dates = getFirstAndLastDateOfCurrentYear();
                firstDate = dates.firstDate
                lastDate = dates.lastDate
                modifiedDate = dates.firstDate
            }else{
                log.debug(DEBUG_IDENTIFIER, 'Getting Future Parents')
                const getCurrDayandLast2weeks = () =>{
                    const currentDate = new Date();
                    const modifyDate = new Date();
                    const last2weeks = new Date(modifyDate.setDate(modifyDate.getDate() - 14))
                    const plus6Months = new Date(modifyDate.setMonth(modifyDate.getMonth() + 6))
                    return { 
                        firstDate: currentDate.toISOString(), 
                        lastDate: plus6Months.toISOString(),
                        modifiedDate: last2weeks.toISOString()  
                    };
                }
                
                const dates = getCurrDayandLast2weeks();
                firstDate = dates.firstDate
                lastDate = dates.lastDate
                modifiedDate = dates.modifiedDate
            }
    
            let bodyObj = {
                "lBound": firstDate,
                "uBound": lastDate,
            }

            //-- call this api to get the full list of parents record in compass
            const parentsList = https.post({
                url: 'https://stedwards-nsw.compass.education/api/person/v1/GetParents',
                body: JSON.stringify(bodyObj),
                headers: headerObj
            })

            const parentsListResponse = JSON.parse(parentsList.body)
            const listLength = parentsListResponse.d.length

            log.debug(DEBUG_IDENTIFIER, 'parents list length: ' + listLength)

            bodyObj = { request: {
                    "lBound": firstDate,
                    "uBound": lastDate,
                    "modifiedSinceTimestamp": modifiedDate,
                    "skip": 0,
                    "take": 5
                    // "take": listLength
                }
            }

            log.debug(DEBUG_IDENTIFIER, 'firstDate: ' + firstDate + ', lastDate: ' + lastDate)
            log.debug(DEBUG_IDENTIFIER, JSON.stringify(bodyObj))


            //-- calling this api for a more detailed parents record
            const getParents = https.post({
                url: 'https://stedwards-nsw.compass.education/API/V4/People/GetParents',
                body: JSON.stringify(bodyObj),
                headers: headerObj
            })

            // log.debug(DEBUG_IDENTIFIER, getParents.body)
            
            const responseBody = JSON.parse(getParents.body)
            const objResultParents = responseBody.d.data
            // log.debug(DEBUG_IDENTIFIER, objResultParents)

            return objResultParents
        }

        const getDebtorsFromCompass = (externalId) => {
            const DEBUG_IDENTIFIER = 'getDebtors'

            const getDebtors = https.post({
                url: 'https://stedwards-nsw.compass.education/api/reference/v1/GetDebtors',
                body: '',
                headers: headerObj
            })

            // log.debug(DEBUG_IDENTIFIER, 'getDebtors: ' + getDebtors.body)

            const responseBody = JSON.parse(getDebtors.body)
            const objDebtors = responseBody.d
            const debtorCode = objDebtors.debtorCode
            const debtorParents = objDebtors.adults

            log.debug(DEBUG_IDENTIFIER, 'parents array: ' + debtorParents)
            log.debug(DEBUG_IDENTIFIER, 'parents array: ' + !isNullOrEmpty(debtorParents))

            if(!isNullOrEmpty(debtorParents)){
                if(debtorParents.includes(externalId)){
                    const debtorSearch = search.create({
                        type: "customer",
                        filters: [
                            ['externalid', 'anyof', debtorCode]
                        ],
                        columns:
                        [
                            search.createColumn({name: "internalid", label: "Internal ID"}),
                            search.createColumn({name: "externalid", label: "External ID"})
                        ]
                    });
                    
                    let internalId
                    debtorSearch.run().each(function(result){
                        internalId = result.getValue({name: 'internalid'})
                        
                        return true;
                    });
                    
                    log.debug(DEBUG_IDENTIFIER, 'parent - ' + externalId + ' has a debtor with internal id: ' + debtorCode)
    
                    return !isNullOrEmpty(internalId) ? internalId : internalId
                }
            }else{
                return ''
            }
        }

        const updateContacts = (internalId,externalid,debtorId,title,firstName,middleName,lastName,role,phone,mobilephone,isStudent,gender,email,receivestatement,addr1,addr2,city,zip,country) => {
            const DEBUG_IDENTIFIER = 'updateContacts';

            // load contact record
            const contact_record = record.load({
                type: record.Type.CONTACT, 
                id: internalId,
                isDynamic: true
            }) 

            // set values on record
            contact_record.setValue({ fieldId: 'externalid', value: externalid}); // no contacts
            contact_record.setValue({ fieldId: 'firstname', value: firstName});
            contact_record.setValue({ fieldId: 'lastname', value: lastName});
            contact_record.setValue({ fieldId: 'middlename', value: middleName});
            if(!isNullOrEmpty(debtorId)){
                contact_record.setValue({ fieldId: 'company', value: debtorId});
            }
            // contact_record.setValue({ fieldId: 'custentity_xw_birthdate', value: dateOfBirth});
            contact_record.setValue({ fieldId: 'custentity_rcv_stmt', value: receivestatement});
            contact_record.setValue({ fieldId: 'custentity_ste_created_by', value: CREATEDBY});
            contact_record.setValue({ fieldId: 'title', value: title});
            contact_record.setText({ fieldId: 'custentity_role', text: role});
            contact_record.setValue({ fieldId: 'phone', value: phone });
            contact_record.setValue({ fieldId: 'mobilephone', value: mobilephone});
            contact_record.setValue({ fieldId: 'custentity_ste_is_student', value: isStudent });
            contact_record.setValue({ fieldId: 'email', value: email});
            
            // update address on record
            contact_record.selectLine({sublistId: 'addressbook', line: 0})
            const addressSubrecord = contact_record.getCurrentSublistSubrecord({
                sublistId: 'addressbook',
                fieldId: 'addressbookaddress'
            });

            addressSubrecord.setValue({ fieldId: 'addr1', value: addr1 })
            addressSubrecord.setValue({ fieldId: 'addr2', value: addr2 })
            addressSubrecord.setValue({ fieldId: 'city', value: city})
            addressSubrecord.setValue({ fieldId: 'zip', value: zip})
            addressSubrecord.setText({ fieldId: 'country', text: country})
            contact_record.commitLine({ sublistId: 'addressbook' })
        
            contact_record.setValue({ fieldId: "custentityxw_gender", value: (gender == "M") ? "1" : "2"});

            const recordId = contact_record.save({ignoreMandatoryFields: true});
            
            log.debug(DEBUG_IDENTIFIER, 'record id: ' + recordId)

            return recordId;
        }

        const createContacts = (externalid,debtorId,title,firstName,middleName,lastName,role,phone,mobilephone,isStudent,gender,email,receivestatement,addr1,addr2,city,zip,country) => {
            const DEBUG_IDENTIFIER = 'createContacts';

            // create contact record
            const contact_record = record.create({
                type: record.Type.CONTACT,
                isDynamic: true
            });

            contact_record.setValue({ fieldId: 'externalid', value: externalid});
            contact_record.setValue({ fieldId: 'firstname', value: firstName});
            contact_record.setValue({ fieldId: 'lastname', value: lastName});
            contact_record.setValue({ fieldId: 'middlename', value: middleName});
            if(!isNullOrEmpty(debtorId)){
                contact_record.setValue({ fieldId: 'company', value: debtorId});
            }
            // contact_record.setValue({ fieldId: 'custentity_xw_birthdate', value: dateOfBirth});
            contact_record.setValue({ fieldId: 'custentity_rcv_stmt', value: receivestatement});
            contact_record.setValue({ fieldId: 'custentity_ste_created_by', value: CREATEDBY});
            contact_record.setValue({ fieldId: 'title', value: title});
            contact_record.setText({ fieldId: 'custentity_role', text: role});
            contact_record.setValue({ fieldId: 'phone', value: phone });
            contact_record.setValue({ fieldId: 'mobilephone', value: mobilephone});
            contact_record.setValue({ fieldId: 'custentity_ste_is_student', value: isStudent });
            contact_record.setValue({ fieldId: 'email', value: email});
            
            // create new address
            contact_record.selectNewLine({ sublistId: 'addressbook' });
            const addressSubrecord = contact_record.getCurrentSublistSubrecord({
                sublistId: 'addressbook',     
                fieldId: 'addressbookaddress'
            });

            addressSubrecord.setValue({ fieldId: 'addr1', value: addr1 })
            addressSubrecord.setValue({ fieldId: 'addr2', value: addr2 })
            addressSubrecord.setValue({ fieldId: 'city', value: city})
            addressSubrecord.setValue({ fieldId: 'zip', value: zip})
            addressSubrecord.setText({ fieldId: 'country', text: country})
            contact_record.commitLine({ sublistId: 'addressbook' })
        
            contact_record.setValue({ fieldId: "custentityxw_gender", value: (gender == "M") ? "1" : "2"});

            const recordId = contact_record.save({ignoreMandatoryFields: true});
            
            log.debug(DEBUG_IDENTIFIER, 'record id: ' + recordId)

            return recordId;
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

        const updateCreateSORecord = (objParams) => {
            const DEBUG_IDENTIFIER = 'updateCreateSORecord';
            const objSOs = objParams.objSOs;
            const objContactMap = objParams.objContactMap;
            let contact_id;
            const item = objParams.enrollItem;
            const expiryDays = objParams.expiryDays;
        
            log.debug(DEBUG_IDENTIFIER, 'Creating Sales Orders');
        
            for (contact_id in objSOs) {
                try {
                    // checkGovernance(100);
                    log.debug(DEBUG_IDENTIFIER, 'Processing contact ' + contact_id);
                    const objSO = objSOs[contact_id];

                    const recSO = record.create({
                        type: record.Type.SALES_ORDER,
                        isDynamic: true
                    });
        
                    if (!objContactMap[contact_id]) {
                        log.debug(DEBUG_IDENTIFIER, 'Contact ' + contact_id + ' not found in netsuite');
                        // throw nlapiCreateError('99999', 'Contact ' + contact_id + ' not found in netsuite', true);
                    }
        
                    if (objContactMap[contact_id].debtor) {
                        recSO.setValue('entity', objContactMap[contact_id].debtor);
                    }
        
                    log.debug(DEBUG_IDENTIFIER, 'objContactMap: ' + JSON.stringify(objContactMap[contact_id]));
                    if (objContactMap[contact_id].id) {
                        recSO.setValue('custbody_stu', objContactMap[contact_id].id);
                    }
        
                    // Set value to "Both not signed and deposit fee unpaid"
                    recSO.setValue('custbody_enrol_stus', 1);
                    recSO.setValue('custbody_ste_offer_email_sent', objParams.sendEmail ? 'T' : 'F');
        
                    // Set value to Future
                    recSO.setText('custbody_ste_student_status', objSO.status);
        
                    let expiryDate = new Date();
                    expiryDays = isNullOrEmpty(parseInt(expiryDays)) ? 0 : parseInt(expiryDays);
                    expiryDate.setDate(expiryDate.getDate() + expiryDays);
                    recSO.setValue('custbody_offr_exp_dt', expiryDate);
                    recSO.setValue('paymentmethod', '');
                    recSO.setValue('ccnumber', '');
                    recSO.setValue('ccexpiredate', '');
                    recSO.setValue('ccname', '');
        
                    recSO.selectNewLine({sublsitId: 'item'});
                    recSO.setCurrentSublistValue({sublistId: 'item', fieldId: 'item', value: item});
                    recSO.commitLine({sublistId: 'item'});
        
                    const soId = recSO.save({ignoreMandatoryFields:  true});
                    log.debug(DEBUG_IDENTIFIER, 'Submitted sales order record ' + soId);
        
                    // Send email when SO is created
        
                    // let stURL = 'https://4553194.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=302&deploy=1&compid=4553194&ns-at=AAEJ7tMQ-2WevZtnrYYPCyHmY7wlu263ofeoct-muqAXt1jLAvA';
                    // stURL += '&custpage_so=' + soId;
                    // stURL += '&custpage_sendemail=' + true;
                    // log.debug(DEBUG_IDENTIFIER, 'STE parent enrollment offer create: ' + stURL);
        
                    // nlapiRequestURL(stURL);
                    const target_url = url.resolveScript({
                        scriptId: 'customscript_ste_send_enrollment_email',
                        deploymentId: 'customdeploy_ste_send_enrollment_email',
                        returnExternalUrl: true
                    }) + "&custpage_so=" + soId + "&custpage_sendemail=" + true

                    const response = https.post({
						url: target_url
					});

                    log.debug(DEBUG_IDENTIFIER, response.body)

                } catch (e) {
                    log.audit({
                        title: e.name,
                        details: e.message
                    });	

                    const objSO = objSOs[contact_id];
                    createErrorResRecord({
                        recordId: objContactMap[contact_id].id,
                        objSO: objSO,
                        // CompanyId: CompanyId ? CompanyId.toString() : CompanyId,
                        errorMessage: e.message,
                        recordType: 'Contact',
                        soExtId: contact_id
                    });
                }
            }
        }

        const getExpiryDays = () => {
            const printOfflttr = search.create({
                type: "customrecord_prin_off_lttr",
                filters:  
                [
                    ['custrecord_offr_current', 'is', 'T']
                ],
                columns:
                [
                    search.createColumn({name: "custrecord_ste_enroll_off_expiry_days"})
                ]
            });

            const result_set = printOfflttr.run();
            const current_range = result_set.getRange({
                start : 0,
                end : 1
            });

            let expiryDays = current_range[0].getValue({name: 'custrecord_ste_enroll_off_expiry_days'})
            expiryDays = expiryDays ? expiryDays : 0

            return expiryDays;
        }

        const isNullOrEmpty = objVariable => {
            return (objVariable == null || objVariable == "" || objVariable == undefined || objVariable == 'undefined' || objVariable == 0);
        };
    
        return module;
        
    });
    