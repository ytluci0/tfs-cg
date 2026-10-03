export type ServiceResult<T>={ok:true;value:T}|{ok:false;status:number;error:string};

export class ServiceRequestError extends Error {
 status:number;
 constructor(message:string,status:number){super(message);this.name='ServiceRequestError';this.status=status;}
}

// Error custom properties do not survive Electron's context bridge. Transfer
// plain data and reconstruct the error in the world that consumes it.
export function unwrapServiceResult<T>(result:ServiceResult<T>):T {
 if(!result.ok)throw new ServiceRequestError(result.error,result.status);
 return result.value;
}
