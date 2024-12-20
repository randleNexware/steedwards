/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 * 
 */
define(['N/runtime','N/search','N/record','N/error'],
    function(runtime, search, record, error)
    {           
        const module = {};

        const currentYearRankMap = {
            'Y07' : 8,
            'Y08' : 9,
            'Y09' : 10,
            'Y10' : 11,
            'Y11' : 12,
            'Y12' : 13
        }
        
        module.getInputData = function()
        {
            const DEBUG_IDENTIFIER = 'getInputData';
        
            try{
                log.debug(DEBUG_IDENTIFIER, '-- start --');
                
                return {
                    type: 'search',
                    id: 'customsearch_xw_student_srch'
                };
            }catch (e){
                log.audit({
                    title: e.name,
                    details: e.message
                });	
            }
        };
        
        module.map = function(context)
        {
            const DEBUG_IDENTIFIER = 'map';
            log.debug(DEBUG_IDENTIFIER, '-- start --');
            
            try{
                log.debug(DEBUG_IDENTIFIER, 'context: '+ context.value);
                const objResult = JSON.parse(context.value);                                                            
                
                //Group By Company Names
                context.write({
                    key : objResult.id,
                    value : objResult.values
                });
            }catch (e){
                log.audit({
                    title: e.name,
                    details: e.message
                });
            }
        };

        module.reduce = function(context){
            const DEBUG_IDENTIFIER = 'reduce';
            log.debug(DEBUG_IDENTIFIER, '-- start --');

            try
            {
                //log.debug(DEBUG_IDENTIFIER,JSON.stringify(context));
                         
                const key = context.key;
                const values = context.values;
                log.debug(DEBUG_IDENTIFIER, 'key:'+ key);
                log.debug(DEBUG_IDENTIFIER, 'values: '+ JSON.stringify(context.values));

                let objSortedContacts = [];
                let nCtr = 0;
                values.forEach(function(contact){
                    const objStudData = {};
                    log.debug(DEBUG_IDENTIFIER, 'contact: ' + contact)

                    contact = JSON.parse(contact);

                    const idStudent = contact["internalid.contact"].value;
                    objStudData.id = idStudent;

                    const currYear = contact["custentity_xw_birthdate.contact"].text;

                    objStudData.doB = contact["custentity_xw_birthdate.contact"]

                    const nRank = currentYearRankMap[currYear];

                    objStudData.rank = nRank;
                    
                    objSortedContacts.push(objStudData);
                });

                log.debug(DEBUG_IDENTIFIER, 'objSortedContacts: '+ JSON.stringify(objSortedContacts));


                // Convert date strings to Date objects in format "yyyy/mm/dd"
                objSortedContacts.forEach(item => {
                    const parts = item.doB.split('/');
                    item.doB = new Date(`${parts[2]}/${parts[1]}/${parts[0]}`);
                });

                // // Sort the array based on the date of birth field
                objSortedContacts.sort((a, b) => a.doB - b.doB);
                log.debug(stLogTitle, 'Sorted Students = '+ JSON.stringify(objSortedContacts));

                var nOrderCtr = 1;
                objSortedContacts.forEach(objStdData => {
                    record.submitFields({
                        type: 'contact',
                        id: objStdData.id,
                        values: {
                            'custentity_family_order' : nOrderCtr
                        }
                    });
                    nOrderCtr++;
                });
                                               
                // context.write(stCustId,stCustId);
            }
            catch (e)
            {
                
                log.error(stLogTitle,e.toString());
                throw e;
            }
        };

        module.summarize = function (summary){
            try{
                log.audit({
                    title: 'Duration',
                    details: summary.seconds
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
            }catch (e){
                log.audit({
                    title: e.name,
                    details: e.message
                });
            }
        };
        
        return module;
    }
);
