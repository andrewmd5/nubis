import { Transformer } from '@parcel/plugin';
import * as fs from 'fs';
import * as path from 'path';

export default new Transformer({
    async transform({ asset }) {
        if (asset.type === 'html') {
            const htmlContent = await asset.getCode();
            const jsonPath = path.join(path.dirname(asset.filePath), '..', '/nubis.json');

            if (fs.existsSync(jsonPath)) {
                const jsonContent = fs.readFileSync(jsonPath, 'utf8');
                const data = JSON.parse(jsonContent);

                const siteData = data.site;

                let modifiedHtmlContent = htmlContent;

                for (const key in siteData) {

                    const regex = new RegExp(`{{(${key})}}`, 'g');
                    modifiedHtmlContent = modifiedHtmlContent.replace(regex, siteData[key]);
                }
                asset.setCode(modifiedHtmlContent);
            }
        }

        return [asset];
    },
});