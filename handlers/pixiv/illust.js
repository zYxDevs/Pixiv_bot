const r_p = require('./r_p')
const db = require('../../db')
const { honsole } = require('../common')
const { thumb_to_all } = require('./tools')
/**
 * get illust data
 * save illust data to MongoDB
 * @param {number} id illust_id
 * @param {object} flag configure
 */
async function get_illust(id, mode = 'p', try_time = 0) {
    if (try_time > 4) {
        return false
    }
    if (typeof id == 'object') {
        return id
    }
    id = typeof id == 'string' ? id : id.toString()
    if (id.length < 6 || id.length > 8 || id == 'NaN') {
        return false
    }
    id = parseInt(id)
    let illust = await db.collection.illust.findOne({
        id: id
    })
    if (!illust) {
        try {
            // data example https://paste.huggy.moe/mufupocomo.json
            illust = (await r_p.get('illust/' + id)).data
            honsole.log('fetch_raw_illust', illust)
            // Work has been deleted or the ID does not exist.
            if (illust.error) {
                return 404
            }
            illust = await update_illust(illust.body)
            return illust
        } catch (error) {
            // network or session
            // to prevent cache attack the 404 result will be not in database.
            honsole.warn(error)
            return 404
        }
    } else {
        delete illust._id
    }
    honsole.log('illust', illust)
    return illust
}

/**
 * fetch image url and size and update in database
 * @param {*} illust 
 * @returns object
 */
async function update_illust(illust, update_flag = true) {
    if (typeof illust != 'object') return false
    let real_illust = {}
    for (let key in illust) {
        // string -> number
        if (['id', 'illustId', 'userId', 'sl', 'illustType', 'illust_page_count', 'illust_id', 'illust_type', 'user_id'].includes(key) && typeof illust[key] == 'string') {
            illust[key] = parseInt(illust[key])
        }
        // _ syntax
        ['Id', 'Title', 'Type', 'Date', 'Restrict', 'Comment', 'Promotion', 'Data', 'Count', 'Original', 'Illust', 'Url', 'Name', 'userAccount', 'Name', 'ImageUrl'].forEach(k1 => {
            if (key.includes(k1)) {
                let k2 = key.replace(k1, `_${k1.toLowerCase()}`)
                illust[k2] = illust[key]
                delete illust[key]
                key = k2
            }
        })
        if (key.includes('illust_')) {
            if (!illust[key.replace('illust_', '')]) {
                illust[key.replace('illust_', '')] = illust[key]
            }
        }
        if (key.includes('user_')) {
            if (!illust[key.replace('user_', 'author_')]) {
                illust[key.replace('user_', 'author_')] = illust[key]
            }
        }
    }
    if (illust.tags) {
        if (illust.tags.tags) {
            let tags = []
            illust.tags.tags.forEach(tag => {
                tags.push(tag.tag)
            })
            illust.tags = tags
        }
    }
    if (new Date(illust.create_date)) {
        illust.create_date = +new Date(illust.create_date) / 1000
    }
    if (illust.type == 2) {
        illust.imgs_ = {
            size: [{
                width: illust.width ? illust.width : illust.imgs_.size[0].width,
                height: illust.height ? illust.height : illust.imgs_.size[0].height
            }]
        }
    } else if (!illust.imgs_ || !illust.imgs_.fsize || !illust.imgs_.fsize[0]) {
        illust.imgs_ = await thumb_to_all(illust)
        if (!illust.imgs_) {
            console.warn(illust.id, 'deleted')
            return
        }
    }
    ['id', 'title', 'type', 'comment', 'description', 'author_id', 'author_name', 'imgs_', 'tags', 'sl', 'restrict', 'x_restrict', 'create_date', 'tg_file_id'].forEach(x => {
        // I think pixiv isn't pass me a object function ?
        if (illust[x] !== undefined) {
            real_illust[x] = illust[x]
        }
    })
    if (!update_flag) {
        try {
            await db.collection.illust.deleteOne({
                id: illust.id
            })
            await db.collection.illust.deleteOne({
                id: illust.id.toString()
            })
        } catch (error) {
            console.warn(error)
        }
    }
    await db.collection.illust.updateOne({
        id: illust.id,
    }, {
        $set: real_illust
    }, {
        upsert: true
    })
    return real_illust
}
module.exports = { get_illust, update_illust }