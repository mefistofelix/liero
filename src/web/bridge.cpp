// Browser I/O adapter. Original simulation remains in src/game.
#include <emscripten.h>
#include <SDL.h>
#include "game/gfx.hpp"
#include "game/sfx.hpp"
#include "game/keys.hpp"
#include "game/math.hpp"
#include "game/controller/localController.hpp"
#include "game/viewport.hpp"
#include "game/stats_recorder.hpp"
#include <algorithm>
#include <cstdint>
#include <memory>
#include <vector>

static std::unique_ptr<LocalController> session;
static std::vector<unsigned char> rgba(320*200*4);
static int info[52], rightMode[2], loadout[2][5]={{1,8,15,22,29},{1,8,15,22,29}};
// Presentation-only telemetry, using the original damage/death callbacks.
static int deathSerial=0, deathCount[2]={}, deaths[2][4], fatalWeapon[2]={-1,-1};
struct BrowserStats : NormalStatsRecorder {
    void damageDealt(Worm* by,WormWeapon* weapon,Worm* target,int hp,bool hit) override {
        NormalStatsRecorder::damageDealt(by,weapon,target,hp,hit);
        if(target&&target->health<=0&&hp>0)fatalWeapon[target->index]=weapon&&weapon->type?int(weapon->type-&gfx.common->weapons[0]):-1;
    }
    void afterSpawn(Worm* worm) override {NormalStatsRecorder::afterSpawn(worm);fatalWeapon[worm->index]=-1;}
    void afterDeath(Worm* worm) override {
        NormalStatsRecorder::afterDeath(worm);++deathCount[worm->index];auto* event=deaths[worm->index];event[0]=++deathSerial;
        event[1]=worm->lastKilledByIdx;event[2]=fatalWeapon[worm->index];event[3]=frame;
    }
};
static bool splitView=false;
static int viewWidth=320, viewHeight=200;
static int viewPlayer=0, optionMode=0, optionLives=15, optionLoading=100, optionBonuses=4;
static int freeX=-1,freeY=-1;
static std::string levelPath;
static int playerColors[2][3]={{26,26,63},{15,43,15}};
static bool rightDown[2], digPulse[2], practice;
static int participants=3;
static int weaponAvailability[40]={};
static void selectAllowedWeapons(){
    auto& g=session->game;
    for(auto* worm:g.worms){auto& w=*worm;
        if(g.settings->weapTable[w.weapons[w.currentWeapon].type-&g.common->weapons[0]]==0)continue;
        for(int k=0;k<5;++k)if(g.settings->weapTable[w.weapons[k].type-&g.common->weapons[0]]==0){w.currentWeapon=k;break;}
    }
}

// Reframe a COPY of the original camera. Render size never changes simulation
// viewports, their per-tick RNG, or the original camera shake calculations.
static Viewport presentation(int p){
    auto v=*session->game.viewports[p];
    if(!splitView){
        v.rect=gvl::rect(0,0,viewWidth,viewHeight);
        v.x=std::max(0,std::min(session->game.level.width-viewWidth,(freeX>=0?freeX:v.x+v.centerX)-viewWidth/2));
        v.y=std::max(0,std::min(session->game.level.height-viewHeight,(freeY>=0?freeY:v.y+v.centerY)-viewHeight/2));
    }
    return v;
}

static bool dirtInFront(Game& g, Worm& w) {
    fixedvec dir=cossinTable[ftoi(w.aimingAngle)&127];
    for(int distance=3;distance<=8;++distance){
        auto p=ftoi(w.pos+dir*distance);
        for(int side=-1;side<=1;++side){
            int x=p.x+(std::abs(dir.y)>std::abs(dir.x)?side:0);
            int y=p.y+(std::abs(dir.x)>=std::abs(dir.y)?side:0);
            if(!g.level.inside(x,y)) continue;
            auto mat=g.level.mat(x,y);
            if(mat.rock()) return false;
            if(mat.anyDirt()) return true;
        }
    }
    return false;
}
static void input(int p,int buttons,int angle,int wheel){
    auto& g=session->game; auto& w=*g.worms[p];
    if((buttons&256)&&w.visible)g.doDamageDirect(w,std::max(1,w.health),p);
    for(int c=0;c<Worm::MaxControl;++c) w.setControlState((Worm::Control)c,false);
    w.externalAim=true; w.aimingAngle=itof(angle&127); w.aimingSpeed=0;
    w.direction=cossinTable[angle&127].x>=0?1:0;
    w.setControlState(Worm::Left,buttons&1); w.setControlState(Worm::Right,buttons&2);
    w.setControlState(Worm::Jump,buttons&4); w.setControlState(Worm::Fire,buttons&8);
    if(buttons&4)w.ninjarope.out=w.ninjarope.attached=false;
    bool hanging=w.ninjarope.out&&w.ninjarope.attached;
    bool right=(buttons&16)!=0;
    if(right&&!rightDown[p]){
        rightMode[p]=dirtInFront(g,w)?1:2;
        if(rightMode[p]==2&&!(buttons&4)){
            w.ninjarope.out=w.ninjarope.attached=false;
            w.release(Worm::Left);w.release(Worm::Right);
            w.press(Worm::Change);w.press(Worm::Jump);w.keyChangePressed=true;
        }
    }
    if(right&&rightMode[p]==1){
        // Repeat original dig edges while held; never auto-throw on tunnel exit.
        digPulse[p]=!digPulse[p];
        if(digPulse[p]&&dirtInFront(g,w)){w.press(Worm::Left);w.press(Worm::Right);}
    }
    if(!right){rightMode[p]=0;digPulse[p]=false;}
    rightDown[p]=right;
    if(wheel&&!w.pressed(Worm::Change)){
        w.release(Worm::Jump); // Scrolling while jumping must not throw rope.
        w.press(Worm::Change); w.setControlState(Worm::Left,wheel<0);
        w.setControlState(Worm::Right,wheel>0); w.keyChangePressed=true;
    }
    if(!wheel&&!(buttons&4)&&(buttons&(64|128))){
        if(hanging){
            w.release(Worm::Left);w.release(Worm::Right);
            w.press(Worm::Change);w.setControlState(Worm::Up,buttons&64);w.setControlState(Worm::Down,buttons&128);
        }else if((buttons&64)&&!w.ninjarope.out)w.press(Worm::Jump);
    }
}
extern "C" {
EMSCRIPTEN_KEEPALIVE void liero_allowed(int id,int enabled){if(id>=1&&id<=40)weaponAvailability[id-1]=enabled?0:2;}
EMSCRIPTEN_KEEPALIVE int liero_weapon_id(int type){for(int id=1;id<=40;++id)if(gfx.common->weapOrder[id-1]==type)return id;return 0;}
EMSCRIPTEN_KEEPALIVE unsigned char* liero_font(){
    static unsigned char data[256*57]={};
    for(int c=2;c<252;++c){auto& ch=gfx.common->font.chars[c-2];data[c*57]=ch.width;std::copy(ch.data,ch.data+56,data+c*57+1);}
    return data;
}
EMSCRIPTEN_KEEPALIVE void liero_color(int p,int red,int green,int blue){
    if(p<0||p>1)return;
    playerColors[p][0]=std::max(0,std::min(63,red));playerColors[p][1]=std::max(0,std::min(63,green));playerColors[p][2]=std::max(0,std::min(63,blue));
    if(session){
        auto& settings=*session->game.worms[p]->settings;
        for(int c=0;c<3;++c)settings.rgb[c]=playerColors[p][c];
        gfx.playRenderer.origpal.setWormColour(p,settings);
    }
}
EMSCRIPTEN_KEEPALIVE void liero_player(int p){viewPlayer=p==1?1:0;freeX=freeY=-1;}
EMSCRIPTEN_KEEPALIVE void liero_camera(int x,int y){freeX=std::max(0,std::min(504,x));freeY=std::max(0,std::min(350,y));}
EM_JS(void, liero_record_audio, (), {
    const ctx=Module['SDL2']&&Module['SDL2'].audioContext;
    if(ctx&&!Module['audioStream']){
        const sink=ctx.createMediaStreamDestination();
        Module['SDL2'].audio.scriptProcessorNode.connect(sink);
        Module['audioStream']=sink.stream;
    }
});
EMSCRIPTEN_KEEPALIVE void liero_options(int mode,int lives,int loading,int bonuses,int imported){
    optionMode=std::max(0,std::min(3,mode));optionLives=std::max(1,std::min(99,lives));
    optionLoading=std::max(1,std::min(1000,loading));optionBonuses=std::max(0,std::min(20,bonuses));
    levelPath=imported?"/import.lev":"";
}
EMSCRIPTEN_KEEPALIVE unsigned char* liero_palette(){
    static unsigned char pixels[256*4];Color palette[256];gfx.common->exepal.activate(palette);
    for(int i=0;i<256;++i){pixels[i*4]=palette[i].r;pixels[i*4+1]=palette[i].g;pixels[i*4+2]=palette[i].b;pixels[i*4+3]=255;}
    return pixels;
}
EMSCRIPTEN_KEEPALIVE void liero_rules_live(int mode,int lives,int loading,int bonuses){
    if(!session)return;
    auto& g=session->game;auto& settings=*g.settings;
    const int oldLives=settings.lives;int previous[2][5];
    for(int p=0;p<2;++p)for(int k=0;k<5;++k)previous[p][k]=g.worms[p]->weapons[k].type->computedLoadingTime(settings);
    settings.gameMode=participants==3?std::max(0,std::min(3,mode)):Settings::GMKillEmAll;
    settings.lives=std::max(1,std::min(99,lives));settings.loadingTime=std::max(1,std::min(1000,loading));settings.maxBonuses=std::max(0,std::min(20,bonuses));
    int fallback=0;bool found=false;
    for(int id=1;id<=40;++id){int type=g.common->weapOrder[id-1];settings.weapTable[type]=weaponAvailability[id-1];if(!found&&weaponAvailability[id-1]==0){fallback=type;found=true;}}
    if(!found)settings.weapTable[fallback]=0;
    for(int p=0;p<2;++p){auto& w=*g.worms[p];
        if(participants&(1<<p))w.lives=std::max(1,w.lives+settings.lives-oldLives);
        for(int k=0;k<5;++k){auto& weapon=w.weapons[k];
            if(weapon.loadingLeft>0){int duration=weapon.type->computedLoadingTime(settings),old=std::max(1,previous[p][k]);weapon.loadingLeft=std::max(1,(weapon.loadingLeft*duration+old-1)/old);}
        }
    }
    selectAllowedWeapons();
}
EMSCRIPTEN_KEEPALIVE unsigned char* liero_weapon_icon(int id){
    static unsigned char pixels[16*16*4];std::fill(pixels,pixels+sizeof(pixels),0);
    if(id<1||id>40)return pixels;
    auto& common=*gfx.common;auto& weapon=common.weapons[common.weapOrder[id-1]];
    Color palette[256];common.exepal.activate(palette);
    for(int y=0;y<7;++y)for(int x=0;x<7;++x){
        int index=weapon.startFrame>=0?common.smallSprites.spritePtr(weapon.startFrame)[y*7+x]:((x==3&&y==3)?weapon.colorBullets:0);
        if(index){auto c=palette[index&255];int i=((y+4)*16+x+4)*4;pixels[i]=c.r;pixels[i+1]=c.g;pixels[i+2]=c.b;pixels[i+3]=255;}
    }
    return pixels;
}
EMSCRIPTEN_KEEPALIVE void liero_view(int split,int width,int height){
    splitView=split!=0;
    viewWidth=splitView?320:std::max(320,std::min(504,width));
    viewHeight=splitView?200:std::max(200,std::min(350,height));
    gfx.playRenderer.init(viewWidth,viewHeight);
    rgba.resize(viewWidth*viewHeight*4);
}
EMSCRIPTEN_KEEPALIVE const char* liero_weapon_name(int id){
    if(id<1||id>40)return "";
    return gfx.common->weapons[gfx.common->weapOrder[id-1]].name.c_str();
}
EMSCRIPTEN_KEEPALIVE void liero_loadout(int player,int slot,int id){
    if(player>=0&&player<2&&slot>=0&&slot<5&&id>=1&&id<=40)loadout[player][slot]=id;
}
EMSCRIPTEN_KEEPALIVE void liero_loadout_live(int player){
    if(!session||player<0||player>1)return;
    auto& g=session->game;auto& w=*g.worms[player];
    WormWeapon previous[5];bool used[5]={};int selected=-1;
    for(int k=0;k<5;++k)previous[k]=w.weapons[k];
    for(int k=0;k<5;++k){
        auto* type=&g.common->weapons[g.common->weapOrder[loadout[player][k]-1]];
        int match=-1;for(int j=0;j<5;++j)if(!used[j]&&previous[j].type==type){match=j;break;}
        if(match>=0){w.weapons[k]=previous[match];used[match]=true;if(match==w.currentWeapon)selected=k;}
        else{WormWeapon fresh;fresh.type=type;fresh.ammo=type->ammo;fresh.loadingLeft=std::max(1,type->computedLoadingTime(*g.settings));w.weapons[k]=fresh;}
        w.settings->weapons[k]=loadout[player][k];
    }
    if(selected>=0)w.currentWeapon=selected;
    selectAllowedWeapons();
}
EMSCRIPTEN_KEEPALIVE int liero_start(unsigned seed,int withBot){
    participants=3;
    session.reset(); gfx.rand.seed(seed); gfx.settings.reset(new Settings);
    // Original replay packet format doesn't carry absolute aim.
    gfx.settings->recordReplays=false; gfx.settings->selectBotWeapons=0;
    gfx.settings->gameMode=optionMode;gfx.settings->lives=optionLives;
    gfx.settings->loadingTime=optionLoading;gfx.settings->maxBonuses=optionBonuses;
    bool anyAllowed=false;for(int id=1;id<=40;++id){gfx.settings->weapTable[gfx.common->weapOrder[id-1]]=weaponAvailability[id-1];anyAllowed|=weaponAvailability[id-1]==0;}
    if(!anyAllowed)gfx.settings->weapTable[gfx.common->weapOrder[0]]=0;
    gfx.settings->randomLevel=levelPath.empty();gfx.settings->levelFile=levelPath;
    for(int p=0;p<2;++p){auto& w=*gfx.settings->wormSettings[p];
        w.controller=(withBot&&p==1)?1:0;w.name=p==0?"BLUE":"GREEN";
        for(int c=0;c<3;++c)w.rgb[c]=playerColors[p][c];
        for(int k=0;k<5;++k)w.weapons[k]=loadout[p][k];
        rightMode[p]=0;rightDown[p]=digPulse[p]=false;
    }
    session.reset(new LocalController(gfx.common,gfx.settings));
    session->game.statsRecorder.reset(new BrowserStats);
    deathSerial=0;deathCount[0]=deathCount[1]=0;std::fill(&deaths[0][0],&deaths[0][0]+8,0);fatalWeapon[0]=fatalWeapon[1]=-1;
    session->game.rand.seed(seed);
    Level level(*gfx.common);level.generateFromSettings(*gfx.common,*gfx.settings,gfx.rand);
    session->swapLevel(level);session->game.focus(gfx.playRenderer);
    // Keep each personal loadout intact; availability controls selection/firing.
    for(int id=0;id<40;++id)gfx.settings->weapTable[id]=0;
    session->changeState(StateWeaponSelection);
    for(int id=1;id<=40;++id)gfx.settings->weapTable[gfx.common->weapOrder[id-1]]=weaponAvailability[id-1];
    session->changeState(StateGame);session->game.browserWeaponRules=true;session->game.browserOverlay=true;selectAllowedWeapons();
    session->fadeValue=33;practice=withBot!=0;return 1;
}
// Waiting alone uses the original simulation, with the unoccupied worm
// eliminated and match completion deferred until a second player joins.
EMSCRIPTEN_KEEPALIVE void liero_participants(int mask){
    if(!session)return;
    participants=mask&3;
    if(participants==1||participants==2){
        session->game.settings->gameMode=Settings::GMKillEmAll;
        for(int p=0;p<2;++p)if(!(participants&(1<<p))){
            auto& w=*session->game.worms[p];w.visible=false;w.lives=0;
            w.ninjarope.out=w.ninjarope.attached=false;
        }
    }
}
EMSCRIPTEN_KEEPALIVE int liero_step(int b0,int a0,int w0,int b1,int a1,int w1){
    if(session&&(participants==1||participants==2)){
        const int p=participants==1?0:1;
        auto& w=*session->game.worms[p];w.lives=std::max(1,w.lives);
        input(p,p==0?b0:b1,p==0?a0:a1,p==0?w0:w1);
        session->game.processFrame();return 1;
    }
    if(!session||session->game.isGameOver())return 0;
    input(0,b0,a0,w0);if(!practice)input(1,b1,a1,w1);
    session->process();return 1;
}
EMSCRIPTEN_KEEPALIVE void liero_begin_play(){
    if(!session)return;auto& g=session->game;g.browserAutoRespawn=true;
    for(int p=0;p<2;++p)if(participants&(1<<p)){
        auto& w=*g.worms[p];if(w.visible)continue;
        // Initial worms still have the original 150-tick countdown and position (0,0).
        // Choose a valid spawn with the original algorithm before skipping the wait.
        w.ready=true;w.beginRespawn(g);
        w.logicRespawn=ftoi(w.pos)-gvl::ivec2(80,80);w.doRespawning(g);
    }
}
EMSCRIPTEN_KEEPALIVE int liero_step_raw(int b0,int b1){
    if(!session)return 0;
    for(int p=0;p<2;++p)session->game.worms[p]->externalAim=false;
    session->game.worms[0]->controlStates.unpack(b0&127);
    session->game.worms[1]->controlStates.unpack(b1&127);
    session->game.processFrame();return 1;
}
EMSCRIPTEN_KEEPALIVE int liero_step_local(int b0,int a0,int w0,int raw0,int raw1){
    if(!session||session->game.isGameOver())return 0;
    if(raw0<0)input(0,b0,a0,w0);
    else{session->game.worms[0]->externalAim=false;session->game.worms[0]->controlStates.unpack(raw0&127);}
    session->game.worms[1]->externalAim=false;
    session->game.worms[1]->controlStates.unpack(raw1&127);
    session->process();return 1;
}
EMSCRIPTEN_KEEPALIVE unsigned char* liero_render(){
    if(!session)return rgba.data();
    auto& r=gfx.playRenderer;r.clear();r.fadeValue=33;
    auto& g=session->game;
    if(splitView)g.draw(r,StateGame,false);
    else{
        auto v=presentation(viewPlayer);auto* original=g.viewports[viewPlayer];
        bool map=g.settings->map;g.settings->map=false;
        // HUD is drawn by the page; keep the original HUD origin in bounds.
        int stats=g.worms[viewPlayer]->statsX;g.worms[viewPlayer]->statsX=0;
        g.viewports[viewPlayer]=&v;v.draw(g,r,StateGame,false);g.viewports[viewPlayer]=original;
        g.worms[viewPlayer]->statsX=stats;g.settings->map=map;
        // Same palette animation as Game::draw, after drawing one viewport.
        r.pal=r.origpal;
        for(int w=0;w<4;++w)r.pal.rotateFrom(r.origpal,g.common->colorAnim[w].from,g.common->colorAnim[w].to,g.cycles>>3);
        r.pal.fade(r.fadeValue);if(g.screenFlash>0)r.pal.lightUp(g.screenFlash);
    }
    Color palette[256];r.pal.activate(palette);
    for(int y=0;y<viewHeight;++y)for(int x=0;x<viewWidth;++x){
        auto c=palette[r.bmp.pixels[y*r.bmp.pitch+x]];int i=(y*viewWidth+x)*4;
        rgba[i]=c.r;rgba[i+1]=c.g;rgba[i+2]=c.b;rgba[i+3]=255;
    }
    return rgba.data();
}
EMSCRIPTEN_KEEPALIVE int liero_aim(int p,int x,int y){
    if(!session||p<0||p>1)return 32;
    auto vp=presentation(p);auto& w=*session->game.worms[p];
    int dx=x-vp.rect.x1+vp.x-ftoi(w.pos.x),dy=y-vp.rect.y1+vp.y-ftoi(w.pos.y);
    if(!dx&&!dy)return ftoi(w.aimingAngle)&127;
    int best=0;int64_t bestDot=INT64_MIN;
    for(int a=0;a<128;++a){int64_t dot=int64_t(dx)*cossinTable[a].x+int64_t(dy)*cossinTable[a].y;
        if(dot>bestDot){bestDot=dot;best=a;}}
    return best;
}
EMSCRIPTEN_KEEPALIVE int* liero_info(){
    if(!session)return info;
    info[0]=session->game.cycles;info[1]=participants==3&&session->game.isGameOver();
    for(int p=0;p<2;++p){auto& w=*session->game.worms[p];
        info[2+p*5]=w.health;info[3+p*5]=w.lives;info[4+p*5]=w.currentWeapon;
        info[5+p*5]=w.ninjarope.out;info[6+p*5]=rightMode[p];}
    auto& weapon=session->game.worms[viewPlayer]->weapons[session->game.worms[viewPlayer]->currentWeapon];
    info[12]=weapon.ammo;info[13]=weapon.loadingLeft;
    info[14]=weapon.type-&gfx.common->weapons[0];info[15]=session->game.worms[viewPlayer]->visible;
    info[16]=session->game.worms[0]->kills;info[17]=session->game.worms[1]->kills;
    info[18]=session->game.worms[0]->timer;info[19]=session->game.worms[1]->timer;
    info[20]=session->game.worms[0]->ninjarope.length;info[21]=session->game.worms[0]->ninjarope.attached;
    info[22]=session->game.worms[1]->ninjarope.length;info[23]=session->game.worms[1]->ninjarope.attached;
    auto camera=presentation(viewPlayer);
    for(int p=0;p<2;++p){auto& w=*session->game.worms[p];int base=24+p*4;
        info[base]=ftoi(w.pos.x)-camera.x+camera.rect.x1;info[base+1]=ftoi(w.pos.y)-camera.y+camera.rect.y1;
        info[base+2]=w.visible;info[base+3]=int(w.weapons[w.currentWeapon].type-&gfx.common->weapons[0]);
        auto& selected=w.weapons[w.currentWeapon];
        info[46+p*3]=w.settings->health;info[47+p*3]=selected.loadingLeft;
        info[48+p*3]=selected.type->computedLoadingTime(*session->game.settings);
        for(int i=0;i<4;++i)info[32+p*4+i]=deaths[p][i];}
    info[40]=camera.x;info[41]=camera.y;info[42]=viewWidth;info[43]=viewHeight;
    info[44]=deathCount[0];info[45]=deathCount[1];
    return info;
}
EMSCRIPTEN_KEEPALIVE void liero_audio(){sfx.init();liero_record_audio();}
EMSCRIPTEN_KEEPALIVE void liero_mute(int muted){if(sfx.initialized)SDL_PauseAudio(muted?1:0);}
EMSCRIPTEN_KEEPALIVE unsigned liero_hash(){
    if(!session)return 0;
    uint32_t hash=2166136261u;
    auto mix=[&hash](uint32_t v){for(int i=0;i<4;++i){hash=(hash^(v&255))*16777619u;v>>=8;}};
    auto& g=session->game;mix(g.cycles);
    for(auto pix:g.level.data)hash=(hash^pix)*16777619u;
    for(int p=0;p<2;++p){auto& w=*g.worms[p];
        mix(w.pos.x);mix(w.pos.y);mix(w.vel.x);mix(w.vel.y);mix(w.aimingAngle);
        mix(w.health);mix(w.lives);mix(w.kills);mix(w.currentWeapon);
        // Original Liero does not initialize rope coordinates/length until a throw.
        // Inactive rope storage is not simulation state and differs across sessions.
        mix(w.ninjarope.out);
        if(w.ninjarope.out){mix(w.ninjarope.pos.x);mix(w.ninjarope.pos.y);mix(w.ninjarope.length);mix(w.ninjarope.attached);}
        for(int k=0;k<5;++k){mix(w.weapons[k].ammo);mix(w.weapons[k].loadingLeft);}}
    return hash;
}
}
int main(){
    try{SDL_Init(0);initKeys();precomputeTables();gfx.rand.seed(1);
        gfx.settings.reset(new Settings);gfx.setConfigPath("/");gfx.common.reset(new Common);
        gfx.common->load(FsNode("/TC/openliero"));gfx.playRenderer.init(320,200);
        gfx.playRenderer.loadPalette(*gfx.common);return 0;
    }catch(std::exception const& e){fprintf(stderr,"Liero initialization: %s\n",e.what());throw;}
}
