/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 */

define(['N/redirect','N/task'],

    function(redirect,task) {

        const module = {}

		module.onRequest = (context) => {
			var LOG_TITLE = 'onRequest'
			try{
				log.debug(LOG_TITLE, '>> START <<');

				callSyncOnDemand();
				redirect.toTaskLink({
					id: 'LIST_MAPREDUCESCRIPTSTATUS',
					parameters:{
						scripttype: '',
						primarykey: ''
					}
				});

				log.debug(LOG_TITLE, '>> END <<');
			}
			catch(e){
				log.audit({
                    title: e.name,
                    details: e.message
                });
			}
		}

        const callSyncOnDemand = () => {
            var mrTask = task.create({
                taskType: task.TaskType.MAP_REDUCE
            });
            mrTask.scriptId = 'customscript_xw_mr_parentcompass_integ';
            mrTask.deploymentId = 'customdeploy2';
            
            mrTask.submit();
        }

        return module;
    });