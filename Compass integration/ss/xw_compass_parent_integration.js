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

define(['N/https', 'N/search', 'N/record', 'N/format', 'N/runtime'],

    function(https,search,record,format,runtime) {
        
        const CREATEDBY = 'Compass';

        const module = {}
        
        module.execute = (context) => {
            let DEBUG_IDENTIFIER = '-- execute --';
            log.debug(DEBUG_IDENTIFIER, '-- START --');
            
            try{
                // const item = runtime.getCurrentScript().getParameter('custscript_ste_cn_enrollment_item');
                // let getOfferedData = runtime.getCurrentScript().getParameter('custscript_get_offered_data');
                // const stURL = runtime.getCurrentScript().getParameter('custscript_ste_url_host_suitelet');
                // const offeredStatus = runtime.getCurrentScript().getParameter('custscript_contact_offered_status');
                // const expiryDays = getExpiryDays();

                // getOfferedData = offeredStatus == '9' ? true : false;
                // getOfferedData = getOfferedData == 'F' ? false : true;

                // log.debug(DEBUG_IDENTIFIER, 'item: ' + item + ', expiryDays: ' + expiryDays + ', getOfferedData: ' + getOfferedData);
                const parentsCompassResult = getParentsFromCompass()
                const parents = parentsCompassResult.parentsArr
                const externalIDs = parentsCompassResult.externalIdArr

                log.debug(DEBUG_IDENTIFIER, 'parents: ' + JSON.stringify(parents))
                log.debug(DEBUG_IDENTIFIER, 'parents externalIDs: ' + externalIDs)

                const contactSearchObj = search.create({
                    type: "contact",
                    filters: 
                    [
                        ['externalid', 'anyof', externalIDs]
                    ],
                    columns:
                    [
                        search.createColumn({name: "internalid"}),
                        search.createColumn({name: "entityid"}),
                        search.createColumn({name: "externalid"}),
                        search.createColumn({name: "custentity_status"})
                    ]
                });

                const result_set = contactSearchObj.run();
                const current_range = result_set.getRange({
                    start : 0,
                    end : 1000
                });

                let i = 0;  // iterator for all search results
                let j = 0;  // iterator for current result range 0..999

                let existContacts = new Array();
                let objexistContacts = {};
                
                while (j < current_range.length){
                    const result = current_range[j];
                    const internalId = result.getValue(result_set.columns[0])||null;
                    const entityId = result.getValue(result_set.columns[1])||null;
                    const externalId = result.getValue(result_set.columns[2])||null;
                    const status = result.getValue(result_set.columns[3])||null;
                    const statusText = result.getText(result_set.columns[3])||null;

                    if (externalId === '') {
                        continue;
                    }

                    if (contains(externalIDs, externalId)) {
                        existContacts.push(externalId);
                        if (objexistContacts[externalId] == null) {
                            objexistContacts[externalId] = {
                                internalid: internalId,
                                status: status,
                                statusName: statusText,
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

                log.debug(DEBUG_IDENTIFIER, 'existContacts: ' + existContacts)
                log.debug(DEBUG_IDENTIFIER, 'objexistContacts: ' + JSON.stringify(objexistContacts))

                let createdRec = 0;
                let updatedRec = 0;
                const totalRec = parents.length;
                if (!isNullOrEmpty(totalRec)) {
                    let Contact_Id;
                    let stringObject;
                    // let CompanyId;
                    // let objContactsMap = {};
                    // let objSOs = {};
                    for (let i = 0; i < totalRec; i++) {
                        try {
                            const externalid = parents[i].externalid
                            const title = parents[i].title
                            const firstName = parents[i].firstName
                            const middleName = parents[i].middleName
                            const lastName = parents[i].lastName
                            const role = parents[i].role
                            const phone = parents[i].phone
                            const mobilephone = parents[i].mobilephone
                            const isStudent = parents[i].isStudent
                            const gender = parents[i].gender
                            const email = parents[i].email
                            const receivestatement = parents[i].receivestatement
                            const addr1 = parents[i].addr1
                            const addr2 = parents[i].addr2 
                            const city = parents[i].city
                            const zip = parents[i].zip
                            const country = parents[i].country
                            
                            stringObject = parents[i]
                            Contact_Id = externalid

                            if (contains(existContacts, externalid)) {
                                log.debug(DEBUG_IDENTIFIER, 'Update: ' + firstName);

                                const internalId = objexistContacts[externalid].internalid;
                                log.debug(DEBUG_IDENTIFIER, 'InternalId: ', internalId);

                                updateContacts(internalId,externalid,title,firstName,middleName,lastName,role,phone,mobilephone,isStudent,gender,email,receivestatement,addr1,addr2,city,zip,country);
                                updatedRec++;

                            } else {
                                log.debug(DEBUG_IDENTIFIER, 'Create record: ' + firstName);
                    
                                const recordId = createContacts(externalid,title,firstName,middleName,lastName,role,phone,mobilephone,isStudent,gender,email,receivestatement,addr1,addr2,city,zip,country);

                                existContacts.push(externalid);
                                objexistContacts[externalid] = {
                                    internalid: recordId,
                                };
                                createdRec++;
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

        const getParentsFromCompass = () => {
            const DEBUG_IDENTIFIER = 'getParents'

            const headerObj = { 
                'CompassApiKey': '04b5e673-4584-4e49-a63f-7f07e0b8b7e9',
                'Content-Type' : 'application/json'
            };
    
            const getFirstAndLastDateOfCurrentYear = () =>{
                const currentYear = new Date().getFullYear();
                const firstDate = new Date(currentYear, 0, 1);  // January 1st
                const lastDate = new Date(currentYear, 11, 31);  // December 31st
                return { 
                    firstDate: firstDate.toISOString(), 
                    lastDate: lastDate.toISOString()  
                };
            }
            
            const { firstDate, lastDate } = getFirstAndLastDateOfCurrentYear();
    
            const bodyObj = { request: {
                    "lBound": firstDate,
                    "uBound": lastDate,
                    "modifiedSinceTimestamp": firstDate,
                    "skip": 0,
                    "take": 2
                }
            }

            log.debug(DEBUG_IDENTIFIER, 'firstDate: ' + firstDate + ', lastDate: ' + lastDate)
            log.debug(DEBUG_IDENTIFIER, JSON.stringify(bodyObj))

            const getParents = https.post({
                url: 'https://stedwards-nsw.compass.education/API/V4/People/GetParents',
                body: JSON.stringify(bodyObj),
                headers: headerObj
            })

            // log.debug(DEBUG_IDENTIFIER, getParents.body)
            
            const responseBody = JSON.parse(getParents.body)
            const objResultContacts = responseBody.d.data
            // log.debug(DEBUG_IDENTIFIER, objResultContacts)
            
            let parentsArr = []
            let externalIdArr = []
            if (objResultContacts.length > 0) {
                for (let i = 0; i < objResultContacts.length; i++) {
                    log.debug(DEBUG_IDENTIFIER, 'objResultContacts: ' + JSON.stringify(objResultContacts[i]));
                    
                    const externalid = objResultContacts[i].compassPersonId
                    const title = objResultContacts[i].title
                    const firstName = objResultContacts[i].firstName
                    const middleName = objResultContacts[i].middleName
                    const lastName = objResultContacts[i].lastName
                    const role = objResultContacts[i].relationships.type
                    const phone = objResultContacts[i].homePhoneNumber
                    const mobilephone = objResultContacts[i].mobileNumber
                    const isStudent = false
                    const gender = objResultContacts[i].gender
                    const email = objResultContacts[i].emailAddress
                    const receivestatement = true
                    const addr1 = objResultContacts[i].addresses.addressLine1
                    const addr2 = objResultContacts[i].addresses.addressLine1
                    const city = objResultContacts[i].addresses.suburb
                    const zip = objResultContacts[i].addresses.postcode
                    const country = objResultContacts[i].addresses.country

                    const objArr = {
                        externalid: externalid,
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
                    
                    parentsArr.push(objArr)

                    if(!contains(externalIdArr,externalid)){
                        externalIdArr.push(externalid)
                    }
                }
            }
            
            return  {
                parentsArr: parentsArr,
                externalIdArr: externalIdArr
            }
        }

        const updateContacts = (internalId,externalid,title,firstName,middleName,lastName,role,phone,mobilephone,isStudent,gender,email,receivestatement,addr1,addr2,city,zip,country) => {
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
            contact_record.setValue({ fieldId: 'custentity_rcv_stmt', value: receivestatement});
            contact_record.setValue({ fieldId: 'custentity_ste_created_by', value: CREATEDBY});
            contact_record.setValue({ fieldId: 'title', value: title});
            contact_record.setValue({ fieldId: 'custentity_role', value: role});
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

            addressSubrecord.setValue({ sublistId: 'addressbook', fieldId: 'addr1', value: addr1 })
            addressSubrecord.setValue({ sublistId: 'addressbook', fieldId: 'addr2', value: addr2 })
            addressSubrecord.setValue({ sublistId: 'addressbook', fieldId: 'city', value: city})
            addressSubrecord.setValue({ sublistId: 'addressbook', fieldId: 'zip', value: zip})
            addressSubrecord.setValue({ sublistId: 'addressbook', fieldId: 'country', value: country})
            contact_record.commitLine({ sublistId: 'addressbook' })
        
            contact_record.setValue({ fieldId: "custentityxw_gender", value: (gender == "Male") ? "1" : "2"});

            const recordId = contact_record.save({ignoreMandatoryFields: true});
            
            log.debug(DEBUG_IDENTIFIER, 'record id: ' + recordId)

            return recordId;
        }

        const createContacts = (externalid,title,firstName,middleName,lastName,role,phone,mobilephone,isStudent,gender,email,receivestatement,addr1,addr2,city,zip,country) => {
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
            contact_record.setValue({ fieldId: 'custentity_rcv_stmt', value: receivestatement});
            contact_record.setValue({ fieldId: 'custentity_ste_created_by', value: CREATEDBY});
            contact_record.setValue({ fieldId: 'title', value: title});
            contact_record.setValue({ fieldId: 'custentity_role', value: role});
            contact_record.setValue({ fieldId: 'phone', value: phone });
            contact_record.setValue({ fieldId: 'mobilephone', value: mobilephone});
            contact_record.setValue({ fieldId: 'custentity_ste_is_student', value: isStudent });
            contact_record.setValue({ fieldId: 'email', value: email});
        
           
            contact_record.selectNewLine({ sublistId: 'addressbook' });
            const addressSubrecord = contact_record.getCurrentSublistSubrecord({
                sublistId: 'addressbook',
                fieldId: 'addressbookaddress'
            });

            addressSubrecord.setValue({ sublistId: 'addressbook', fieldId: 'addr1', value: addr1 })
            addressSubrecord.setValue({ sublistId: 'addressbook', fieldId: 'addr2', value: addr2 })
            addressSubrecord.setValue({ sublistId: 'addressbook', fieldId: 'city', value: city})
            addressSubrecord.setValue({ sublistId: 'addressbook', fieldId: 'zip', value: zip})
            addressSubrecord.setValue({ sublistId: 'addressbook', fieldId: 'country', value: country})
            contact_record.commitLine({ sublistId: 'addressbook' })
        
            contact_record.setValue({ fieldId: "custentityxw_gender", value: (gender == "Male") ? "1" : "2"});

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
        
        const getExpiryDays = () => {
            const arrSearch = search.create({
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
        
            const searchResultCount = arrSearch.runPaged().count;
            if (!searchResultCount) {
                return 0;
            }
        
            let expiryDays
            arrSearch.run().each(function(result){
                expiryDays = result.getValue({name: 'custrecord_ste_enroll_off_expiry_days'})

                return true;
            });

            expiryDays = expiryDays ? expiryDays : 0;
        
            return expiryDays;
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
    