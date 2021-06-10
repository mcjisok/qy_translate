import { getTokenFromStorage, saveTokenInfo } from '../utils/chromeApi'
import { Ref } from 'vue'
import { Mode, client, clientVersion } from '../config'
import { IRequestResult, IQrLoginParams, ITokenInfo } from '@/utils/interface'
import { eventToGoogle } from '../utils/analytics'

let protocol = "https://"
let webSocketProtocol = "wss://"
let BaseUrl = 'www.fishfit.fun:8080/p'

if (Mode === 'test' || Mode === 'jest') {
  protocol = 'http://'
  webSocketProtocol = 'ws://'
  BaseUrl = 'localhost:8080/p'
}

export async function qrLogin({ qrUrl, loginStatus }: IQrLoginParams) {
  eventToGoogle({
    name: 'load_qr',
    params: {
      status: loginStatus.value,
    }
  })

  loginStatus.value = 'loadingQr'
  const start = new Date().getTime()
  const ws = new WebSocket(webSocketProtocol + BaseUrl + "/user/login_qr");
  ws.binaryType = "arraybuffer";

  ws.onopen = (event) => {
    ws.send("login");
  };

  ws.onmessage = (event) => {
    const msg = getStrFromBuf(event.data);
    if (msg.slice(0, 9) === `{"token":`) {
      ws.send("loginOk");
      const tokenInfo:ITokenInfo = JSON.parse(msg)
      saveTokenInfo(tokenInfo, (msg: string) => {
        loginStatus.value = "loginOk"
      })
      eventToGoogle({
        name: 'qr_loginOk',
        params: {
          openid: tokenInfo.openid,
          cost: start - new Date().getTime()
        }
      })
    } else if (msg.slice(0, 5) === "{err") {
    } else {
      qrUrl.value = "data:image/jpeg;base64," + window.btoa(msg);
      loginStatus.value = "scanQr" // scanQr
      eventToGoogle({
        name: 'qr_load',
        params: {
          cost: start - new Date().getTime()
        }
      })
    }
  };

  ws.onclose = function (event) {
    if (loginStatus.value === 'scanQr') {
      loginStatus.value = 'invalidQr'
    } else if (loginStatus.value === 'loadingQr') {
      loginStatus.value = 'loadQrFail'
    }
    eventToGoogle({
      name: 'qr_ws_close',
      params: {
        status: loginStatus.value,
      }
    })
  };

  function getStrFromBuf(buf: ArrayBuffer) {
    const byte = new Uint8Array(buf);
    const len = byte.byteLength;
    let s = "";
    for (let i = 0; i < len; i++) {
      s += String.fromCharCode(byte[i]);
    }
    return s;
  }
};


export function baseFetch({ url, method, success, fail, data, headers = {}, successStatusCode = [200, 201] }:
  { url: string, method: string, success: Function, fail: Function, data: any, headers: any, successStatusCode?: number[] }) {
  return new Promise((resolve, reject) => {
    fetch(url, {
      method,
      headers,
      body: data,
    })
      .then(res => {
        if (successStatusCode.includes(res.status)) {
          resolve(res)
        } else {
          reject(res)
        }

      })
      .catch(err => {
        console.log('fetch err: ', err)
        reject('fetch_err')
      })
  }).then(res => success(res)).catch((err) => fail(err))
}



export async function serveBaseReq({ url, method, success, fail, data = {}, headers = {}, auth = false, successStatusCode = [200, 201] }:
  { url: string, method: string, success?: Function, fail?: Function, data: any, headers?: any, auth: boolean, successStatusCode?: number[] }): Promise<IRequestResult> {


  const start = new Date().getTime()
  return new Promise<IRequestResult>(async (resolve, reject) => {
    if (auth === true) {
      headers.Authorization = await getTokenFromStorage()
      if (headers.Authorization === 'needLogin' || headers.Authorization === 'needRelogin') {
        reject({ errMsg: headers.Authorization, status: 0, data: null })
        return
      }
    }

    headers.c = client
    headers.cv = clientVersion

    baseFetch({
      url: protocol + BaseUrl + url,
      method,
      data: JSON.stringify(data),
      headers,
      success: async (res: any) => {
        await resolve(getResult(res))
      },
      fail: async (err: any) => {
        if (err === `fetch_err`) {
          reject({
            errMsg: `fetchReq_${url}_err`,
            toastMsg: '网络开小差了!'
          })
        } else {
          await reject(getResult(err, `authReq_${url}_err`))
        }
      }
    })

  }).then((res: IRequestResult) => {
    const cost = new Date().getTime() - start
    eventToGoogle({
      name: 'serveReqOk',
      params: {
        url,
        method,
        cost
      }
    })
    success && success(res);
    return res
  }).catch((err: IRequestResult) => {
    const cost = new Date().getTime() - start
    eventToGoogle({
      name: 'serveReqFail',
      params: {
        url,
        method,
        cost,
      }
    })
    fail && fail(err);
    return err
  })
}

async function getResult(res: any, errMsg: string = ''): Promise<IRequestResult> {

    let data;
    let toastMsg;
    let serveToastMsg;
    try {
      data = JSON.parse(await res.text())
      toastMsg = data.toastMsg
      serveToastMsg = data.serveToastMsg
    } finally {
      if (errMsg && !toastMsg) {
        toastMsg = '网络开小差!'
      }
    
      if(toastMsg) {
        serveToastMsg = undefined
      }

      return {
        status: res.status,
        errMsg,
        data,
        toastMsg,
        serveToastMsg
      }
    }
  
}

export async function collectResult({ success, fail, data }: { success?: Function, fail?: Function, data: any }) {
  return await serveBaseReq({
    url: '/phrase',
    method: 'POST',
    data,
    success: (res: any) => {
      success && success(res)
    },
    fail: (err: any) => fail && fail(err),
    auth: true,
    successStatusCode: [201]
  })
}

export async function reduceCollect({ success, fail, data }: { success?: Function, fail?: Function, data: any }): Promise<any> {
  return await serveBaseReq({
    url: '/phrase',
    method: 'DELETE',
    data,
    success: (res: any) => success && success(res),
    fail: (err: any) => fail && fail(err),
    auth: true,
    successStatusCode: [200]
  })
}

export async function updateMark({ success, fail, data }: { success?: Function, fail?: Function, data: any }) {
  return await serveBaseReq({
    url: '/phrase',
    method: 'PUT',
    data,
    success: (res: any) => success && success(res),
    fail: (err: any) => fail && fail(err),
    auth: true,
    successStatusCode: [200]
  })
}

export async function sendEvent(data: any) {
  return await serveBaseReq({
    url: '/phrase',
    method: 'POST',
    data,
    success: () => { },
    fail: () => { },
    auth: false
  })
}

