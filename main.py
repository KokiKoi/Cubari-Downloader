import eel
import requests
import base64
import urllib.parse
import json
import os
import zipfile
import time

eel.init('web')
LIBRARY_FILE = "library.json"

# --- Library Management ---
@eel.expose
def get_library():
    if not os.path.exists(LIBRARY_FILE):
        return []
    try:
        with open(LIBRARY_FILE, "r") as f:
            return json.load(f)
    except:
        return []

@eel.expose
def save_to_library(link):
    data = fetch_cubari_data(link)
    if data.get("status") == "error":
        return data
        
    lib = get_library()
    if any(item['link'] == link for item in lib):
        return {"status": "error", "message": "Already in library"}
        
    new_item = {
        "title": data["title"],
        "cover": data["cover"],
        "link": link
    }
    lib.append(new_item)
    
    with open(LIBRARY_FILE, "w") as f:
        json.dump(lib, f)
    return {"status": "success", "library": lib}

@eel.expose
def remove_from_library(link):
    lib = [item for item in get_library() if item['link'] != link]
    with open(LIBRARY_FILE, "w") as f:
        json.dump(lib, f)
    return lib

# --- Core Scraper ---
@eel.expose
def fetch_cubari_data(link):
    try:
        link = link.rstrip('/')
        json_url = None
        
        if link.endswith('.json'):
            json_url = link
        elif "gist/" in link:
            raw_id = link.split('gist/')[-1]
            is_b64_path = False
            
            try:
                padded_id = raw_id + "=" * ((4 - len(raw_id) % 4) % 4)
                decoded_bytes = base64.b64decode(padded_id)
                decoded_path = urllib.parse.unquote(decoded_bytes.decode('utf-8'))
                
                if decoded_path.startswith('raw/'):
                    json_url = f"https://raw.githubusercontent.com/{decoded_path[4:]}"
                    is_b64_path = True
                elif decoded_path.startswith('http'):
                    json_url = decoded_path
                    is_b64_path = True
            except:
                pass 
            
            if not is_b64_path:
                json_url = f"https://api.github.com/gists/{raw_id}"
        else:
            return {"status": "error", "message": "Unsupported link format."}
            
        resp = requests.get(json_url)
        resp.raise_for_status()
        data = resp.json()
        
        if 'files' in data:
            first_file = list(data['files'].values())[0]
            data = json.loads(first_file['content'])

        series_cover = data.get('cover', '')
        chapters_data = data.get('chapters', {})
        parsed_chapters = []
        
        for chap_num, chap_info in chapters_data.items():
            groups = chap_info.get('groups', {})
            if not groups: continue
            
            first_group_key = list(groups.keys())[0]
            images = groups[first_group_key]
            is_proxy = isinstance(images, str)
            
            if not isinstance(images, list) and not is_proxy: 
                continue
            
            thumbnail = ""
            if not is_proxy and len(images) > 0:
                thumbnail = images[0].get('src', '') if isinstance(images[0], dict) else images[0]

            parsed_chapters.append({
                "number": chap_num,
                "title": chap_info.get('title', ''),
                "thumbnail": thumbnail,
                "images": images,
                "is_proxy": is_proxy
            })
            
        parsed_chapters.sort(key=lambda x: float(x['number']) if x['number'].replace('.','').isdigit() else 0)

        return {
            "status": "success", 
            "title": data.get('title', 'Unknown Series'), 
            "cover": series_cover,
            "chapters": parsed_chapters
        }
        
    except Exception as e:
        return {"status": "error", "message": f"Failed to load library: {str(e)}"}

# --- Downloader ---
@eel.expose
def download_chapters(series_title, selected_chapters, as_cbz, naming_format):
    safe_title = "".join([c for c in series_title if c.isalpha() or c.isdigit() or c in (' ', '-', '_')]).rstrip()
    if not safe_title: safe_title = "Downloaded_Manga"
    
    base_folder = os.path.join(os.getcwd(), "Downloads", safe_title)
    os.makedirs(base_folder, exist_ok=True)
    
    for chap in selected_chapters:
        chap_num = chap['number']
        raw_title = chap.get('title', '')
        images = chap['images']
        safe_chap_title = "".join([c for c in raw_title if c.isalpha() or c.isdigit() or c in (' ', '-', '_')]).rstrip()
        
        if naming_format == 'chap_num_title':
            chap_folder_name = f"Chapter {chap_num} - {safe_chap_title}" if safe_chap_title else f"Chapter {chap_num}"
        elif naming_format == 'chap_num':
            chap_folder_name = f"Chapter {chap_num}"
        elif naming_format == 'title_only':
            chap_folder_name = f"{safe_chap_title}" if safe_chap_title else f"Chapter {chap_num}"
        elif naming_format == 'series_chap_title':
            chap_folder_name = f"{safe_title} - Chapter {chap_num} - {safe_chap_title}" if safe_chap_title else f"{safe_title} - Chapter {chap_num}"
        else:
            chap_folder_name = f"Chapter {chap_num}"
            
        chap_path = os.path.join(base_folder, chap_folder_name)
        os.makedirs(chap_path, exist_ok=True)
        
        if chap.get('is_proxy', False) or isinstance(images, str):
            eel.update_status(f"Resolving Proxy for Ch {chap_num}...")()
            proxy_url = images if images.startswith('http') else f"https://cubari.moe{images if images.startswith('/') else '/' + images}"

            try:
                p_req = requests.get(proxy_url, headers={'User-Agent': 'Mozilla/5.0'})
                p_req.raise_for_status()
                p_data = p_req.json()
                
                if isinstance(p_data, list):
                    images = p_data
                elif isinstance(p_data, dict):
                    if 'images' in p_data: images = p_data['images']
                    elif 'pages' in p_data: images = p_data['pages']
                    elif 'groups' in p_data and isinstance(p_data['groups'], dict):
                        first_grp = list(p_data['groups'].keys())[0]
                        images = p_data['groups'][first_grp]
                    else:
                        images = [v for k,v in p_data.items() if isinstance(v, (str, dict))]
            except Exception:
                eel.update_status(f"Skipping Ch {chap_num} - Proxy Error")()
                continue
                
        if not isinstance(images, list):
            continue
            
        downloaded_files = []
        
        for idx, img in enumerate(images):
            eel.update_status(f"Downloading Ch {chap_num}: Page {idx+1}/{len(images)}")()
            img_url = img.get('src') if isinstance(img, dict) else img
            
            try:
                r = requests.get(img_url, stream=True, headers={'User-Agent': 'Mozilla/5.0'})
                ext = img_url.split('.')[-1].split('?')[0]
                if len(ext) > 4 or not ext: ext = 'jpg'
                
                file_name = f"{idx+1:03d}.{ext}"
                file_path = os.path.join(chap_path, file_name)
                
                with open(file_path, 'wb') as f:
                    for chunk in r.iter_content(1024):
                        f.write(chunk)
                downloaded_files.append(file_path)
                time.sleep(0.05) 
            except Exception:
                pass 
                
        if as_cbz:
            eel.update_status(f"Zipping Ch {chap_num} into .cbz...")()
            cbz_path = os.path.join(base_folder, f"{chap_folder_name}.cbz")
            with zipfile.ZipFile(cbz_path, 'w') as cbz:
                for f in downloaded_files:
                    cbz.write(f, os.path.basename(f))
            
            for f in downloaded_files:
                os.remove(f)
            os.rmdir(chap_path)

    eel.update_status("Download Complete! Check your Downloads folder.")()
    return "Done"

if __name__ == '__main__':
    eel.start('index.html', size=(1400, 900))