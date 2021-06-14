const r_p = require('./r_p')
const { asyncForEach, sleep } = require('../common')
const { default: axios } = require('axios')
const ua = require('../../config.json').pixiv.ua
const ugoira_to_mp4 = require('./ugoira_to_mp4')
const db = require('../../db')
const get_illust = require('./illust')
/**
 * get user data
 * save illust data to MongoDB
 * @param {number} id illust_id
 * @param {object} flag configure
 */
async function get_user(id) {
    if (id.toString().length > 8 && id > 80000000)
        return false
    if (process.env.dev) {
        console.log('u', id)
    }
}
/**
 * get user's (all) illusts
 * @param {*} id user id
 * @param {*} page when pages = 0 will return all illusts
 * @param {*} try_time 
 * @returns object / boolean
 */
async function get_user_illusts(id, page = 0, try_time = 0) {
    let col = await db.collection('illust')
    if (try_time > 5) {
        return false
    }
    try {
        if (typeof page == 'number') {
            let illusts = []
            let illust_id_list_all = (await r_p.get(`user/${id}/profile/all`)).data
            if (illust_id_list_all.error) {
                return 404
            }
            if (illust_id_list_all.body && illust_id_list_all.body.illusts) {
                illust_id_list_all = illust_id_list_all.body.illusts
                let illust_id_list_p = [[]]
                // 50 items per page
                for (const id in illust_id_list_all) {
                    illust_id_list_p[illust_id_list_p.length - 1].push(id)
                    if (illust_id_list_p[illust_id_list_p.length - 1].length > 49) {
                        illust_id_list_p.push([])
                    }
                }
                if (page != 0) {
                    illust_id_list_p = [illust_id_list_p[page - 1]]
                }
                await asyncForEach(illust_id_list_p, async illust_id_list => {
                    if (illust_id_list.length > 0) {
                        if (a = await get_user_illusts(id, illust_id_list)) {
                            illusts = [...illusts,...a]
                            
                        }
                    }
                })
                return illusts.filter(i=>{
                    return i.id
                })
            }
        } else if (typeof page == 'object') {
            let illusts = page
            let local_illust_data = await (col.find({
                $or: page.map(id=>{
                    return {
                        id: id
                    }
                })
            }))
            await local_illust_data.forEach(l=>{
                illusts[page.indexOf(l.id)] = l
            })
            let p = illusts.filter(x=>{return typeof x != 'object'})
            if(p.length > 0){
                if(process.env.dev){
                    console.log('query from pixiv',p)
                }
                let illusts_data = (await r_p.get(`user/${id}/profile/illusts?ids%5B%5D=${p.join('&ids%5B%5D=')}&work_category=illustManga&is_first_page=1`)).data
                for (const id in illusts_data.body.works) {
                    illusts[page.indexOf(id)] = {
                        ...illusts_data.body.works[id],
                        flag: true
                    }
                }
            }
            await asyncForEach(illusts,async (illust,id)=>{
                let extra = {}
                if(!illust.flag) return
                extra.type = illust.illustType
                extra.imgs_ = {
                    thumb_urls: [],
                    regular_urls: [],
                    original_urls: [],
                    size: []
                }
                if(illust.illustType <= 1){
                    illust.url = illust.url.replace('i.pximg.net', 'i-cf.pximg.net')
                    let url = illust.url.replace('/c/250x250_80_a2/custom-thumb','∏a∏').replace('_custom1200','∏b∏')
                                            .replace('/c/250x250_80_a2/img-master','∏a∏').replace('_square1200','∏b∏')
                    let original_url = url.replace('∏a∏','/img-original').replace('∏b∏','')
                    let regular_url = url.replace('∏a∏','/img-master').replace('∏b∏','_master1200')
                    try {
                        // original may be a .png file
                        // send head reqeust to check.
                        if(process.env.dev){
                            console.log('trying',original_url)
                        }
                        await axios.head(original_url,{
                            headers: {
                                'User-Agent': ua,
                                'Referer': 'https://www.pixiv.net'
                            }
                        })
                    } catch (error) {
                        if(error.response.status == 404){
                            original_url = original_url.replace('.jpg','.png')
                        } else {
                          console.warn(error)
                        }
                    }
                    for (let i = 0; i < illust.pageCount; i++) {
                        extra.imgs_.thumb_urls[i] = illust.url.replace('p0',`p${i}`)
                        extra.imgs_.regular_urls[i] = regular_url.replace('p0',`p${i}`)
                        extra.imgs_.original_urls[i] = original_url.replace('p0',`p${i}`)
                        extra.imgs_.size[i] = {
                            width: illust.width,
                            height: illust.height
                        }
                    }
                }else if(illust.illustType == 2){
                    extra.imgs_ = {
                        size: [{
                            width: illust.width,
                            height: illust.height
                        }]
                    }
                    ugoira_to_mp4(illust.id)
                }
                let data = {
                    id: illust.id,
                    title: illust.title,
                    description: illust.description,
                    type: illust.illustType,
                    userName: illust.userName,
                    userId: illust.userId,
                    restrict: illust.restrict,
                    xRestrict: illust.xRestrict,
                    tags: illust.tags,
                    createDate: illust.createDate,
                    imgs_: extra.imgs_
                }
                try {
                    col.insertOne(data)
                } catch (error) {
                    console.warn(error)
                }
                illusts[id] = data
            })
            return illusts
        }
    } catch (e) {
        console.warn(e)
        await sleep(500)
        return get_user_illusts(id, page, try_time++)
    }
    return false
}
module.exports = {
    get_user,
    get_user_illusts
}