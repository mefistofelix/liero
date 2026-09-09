// Complete online save/restore adapter. No native simulation/replay format changes.
// Included by bridge.cpp so browser input state and native state form one checkpoint.
#include <limits>
#include <type_traits>
#include <stdexcept>

namespace netstate {
constexpr size_t MaxBytes=2*1024*1024;
struct Archive {
    bool in; std::vector<unsigned char>& data; size_t cursor=0;
    Archive(std::vector<unsigned char>& data,bool in):in(in),data(data){if(!in)data.clear();}
    void bytes(void* pointer,size_t length){
        if(length>MaxBytes||cursor>MaxBytes-length)throw std::runtime_error("Checkpoint too large");
        if(in){if(cursor+length>data.size())throw std::runtime_error("Truncated checkpoint");std::memcpy(pointer,data.data()+cursor,length);}
        else{auto* p=static_cast<unsigned char*>(pointer);data.insert(data.end(),p,p+length);}
        cursor+=length;
    }
    template<class T> void n(T& value,int64_t low=INT32_MIN,int64_t high=INT32_MAX){
        uint32_t bits=in?0:uint32_t(value);unsigned char buf[4];
        if(!in)for(int k=0;k<4;++k)buf[k]=bits>>(8*k);
        bytes(buf,4);
        if(in){for(int k=0;k<4;++k)bits|=uint32_t(buf[k])<<(8*k);
            int64_t v=std::is_signed<T>::value?int64_t(int32_t(bits)):int64_t(bits);
            if(v<low||v>high)throw std::runtime_error("Invalid checkpoint field at "+std::to_string(cursor-4)+": "+std::to_string(v));value=T(v);}
    }
    void b(bool& value){unsigned char v=in?0:value;bytes(&v,1);if(v>1)throw std::runtime_error("Invalid boolean");if(in)value=v!=0;}
    template<class V> void vec(V& v){n(v.x);n(v.y);}
    void rect(gvl::rect& r){n(r.x1);n(r.y1);n(r.x2);n(r.y2);}
    void rng(Rand& r){n(r.x,0,UINT32_MAX);n(r.c,0,UINT32_MAX);}
    template<class T> void type(T const*& p,std::vector<T>& types){int id=in?0:int(p-types.data());n(id,0,int(types.size())-1);if(in)p=&types[id];}
    void weapon(WormWeapon*& p,Game& g){
        int id=-1;if(!in&&p)for(int w=0;w<2;++w)for(int k=0;k<5;++k)if(p==&g.worms[w]->weapons[k])id=w*5+k;
        n(id,-1,9);if(in)p=id<0?nullptr:&g.worms[id/5]->weapons[id%5];
    }
    template<class T,int Limit,class F> void objects(ExactObjectList<T,Limit>& list,F fields){
        if(in)list.clear();
        for(int k=0;k<Limit;++k){auto& obj=list.arr[k];b(obj.used);if(!obj.used)continue;
            if(in){++list.count;list.freeList[k>>5]&=~(uint32_t(1)<<(k&31));}fields(obj);}
    }
};
static std::vector<unsigned char> saved[2], transfer;
static gvl::shared_ptr<SoundPlayer> audible;
static gvl::shared_ptr<SoundPlayer> silent(new NullSoundPlayer);

static void archive(Archive& a){
    if(!session||practice||session->game.worms.size()!=2)throw std::runtime_error("Online checkpoint requires two native human worms");
    auto& g=session->game;auto& s=*g.settings;auto& common=*g.common;
    uint32_t magic=0x31534e4c;a.n(magic,0,UINT32_MAX);if(magic!=0x31534e4c)throw std::runtime_error("Checkpoint version mismatch");
    a.n(participants,1,3);a.n(g.cycles,0,252001);a.rng(g.rand);a.rng(gfx.rand);
    a.n(g.screenFlash);a.b(g.gotChanged);a.n(g.lastKilledIdx,-1,1);a.b(g.paused);a.b(g.quickSim);
    a.b(g.browserWeaponRules);a.b(g.browserOverlay);a.b(g.browserAutoRespawn);
    int state=session->state;a.n(state,StateGame,StateGameEnded);if(a.in)session->state=GameState(state);
    a.n(session->cycles);a.n(session->frameSkip,1,1);a.b(session->inverseFrameSkip);
    a.n(s.gameMode,0,3);a.n(s.maxBonuses,0,99);a.n(s.blood,0,10000);a.n(s.timeToLose,1,1000000);
    a.n(s.flagsToWin,1,1000000);a.n(s.lives,1,99);a.n(s.loadingTime,1,1000);
    a.n(s.bloodParticleMax,1,10000);a.n(s.zoneTimeout,1,1000000);
    a.b(s.shadow);a.b(s.loadChange);a.b(s.namesOnBonuses);a.b(s.regenerateLevel);a.b(s.screenSync);
    for(int k=0;k<40;++k){a.n(s.weapTable[k],0,2);a.n(weaponAvailability[k],0,2);}
    a.n(optionMode,0,3);a.n(optionLives,1,99);a.n(optionLoading,1,1000);a.n(optionBonuses,0,20);
    auto& zone=g.holdazone;a.rect(zone.rect);a.n(zone.holderIdx,-1,1);a.n(zone.contenderIdx,-1,1);
    a.n(zone.contenderFrames);a.n(zone.timeoutLeft);a.n(zone.zoneWidth,0,504);a.n(zone.zoneHeight,0,350);
    auto& level=g.level;int width=level.width,height=level.height;a.n(width,504,504);a.n(height,350,350);
    if(a.in)level.resize(width,height);
    a.bytes(level.data.data(),level.data.size());
    static_assert(sizeof(Material)==1,"Material flags must be bytes");a.bytes(level.materials.data(),level.materials.size());a.bytes(&level.zeroMaterial.flags,1);
    for(auto& c:level.origpal.entries){a.bytes(&c.r,1);a.bytes(&c.g,1);a.bytes(&c.b,1);if(a.in)c.unused=0;}
    for(int p=0;p<2;++p){auto& w=*g.worms[p];auto& ws=*w.settings;
        a.vec(w.pos);a.vec(w.vel);a.vec(w.logicRespawn);a.n(w.hotspotX);a.n(w.hotspotY);a.n(w.aimingAngle);a.n(w.aimingSpeed);
        a.b(w.externalAim);a.b(w.ableToJump);a.b(w.ableToDig);a.b(w.keyChangePressed);a.b(w.movable);
        a.b(w.animate);a.b(w.visible);a.b(w.ready);a.b(w.flag);a.b(w.makeSightGreen);
        a.n(w.health);a.n(w.lives);a.n(w.kills);a.n(w.timer);a.n(w.killedTimer);a.n(w.currentFrame,0,20);a.n(w.flags);
        auto& r=w.ninjarope;a.b(r.out);
        if(r.out){a.b(r.attached);int anchor=a.in?-1:r.anchor?r.anchor->index:-1;a.n(anchor,-1,1);if(a.in)r.anchor=anchor<0?nullptr:g.worms[anchor];
            a.vec(r.pos);a.vec(r.vel);a.n(r.length);a.n(r.curLen);}
        else if(a.in){r.attached=false;r.anchor=nullptr;r.pos.zero();r.vel.zero();r.length=r.curLen=0;}
        a.n(w.currentWeapon,0,4);a.n(w.lastKilledByIdx,-1,1);a.n(w.fireCone);a.n(w.leaveShellTimer);a.n(w.direction,0,1);
        for(auto& reaction:w.reacts)a.n(reaction);
        for(int k=0;k<5;++k){auto& ww=w.weapons[k];a.type(ww.type,common.weapons);a.n(ww.ammo);a.n(ww.delayLeft);a.n(ww.loadingLeft);
            a.n(loadout[p][k],1,40);a.n(ws.weapons[k],1,40);}
        a.n(ws.health,1,10000);a.n(w.controlStates.istate,0,127);a.n(w.prevControlStates.istate,0,127);a.n(w.cleanControlStates.istate,0,127);
        a.n(w.steerableCount,0,600);a.n(w.steerableSumX);a.n(w.steerableSumY);
        a.n(rightMode[p],0,2);a.b(rightDown[p]);a.b(digPulse[p]);
        a.n(deathCount[p],0,252001);a.n(fatalWeapon[p],-1,39);for(auto& v:deaths[p])a.n(v);
        if(a.in){w.ai.reset();w.index=p;}
    }
    a.n(deathSerial,0,504002);a.n(static_cast<BrowserStats&>(*g.statsRecorder).frame,0,252001);
    if(g.viewports.size()!=2)throw std::runtime_error("Invalid viewports");
    for(auto* vp:g.viewports){a.n(vp->x);a.n(vp->y);a.n(vp->shake);a.n(vp->maxX);a.n(vp->maxY);
        a.n(vp->centerX);a.n(vp->centerY);a.n(vp->wormIdx,0,1);a.n(vp->bannerY);a.rect(vp->rect);a.rng(vp->rand);}
    a.objects(g.wobjects,[&](WObject& o){a.vec(o.pos);a.vec(o.vel);a.type(o.type,common.weapons);a.n(o.ownerIdx,-1,1);
        a.n(o.curFrame);a.n(o.timeLeft);a.weapon(o.firedBy,g);a.b(o.hasHit);});
    a.objects(g.nobjects,[&](NObject& o){a.vec(o.pos);a.vec(o.vel);a.type(o.type,common.nobjectTypes);a.n(o.ownerIdx,-1,1);
        a.n(o.curFrame);a.n(o.timeLeft);a.weapon(o.firedBy,g);a.b(o.hasHit);});
    a.objects(g.sobjects,[&](SObject& o){a.n(o.x);a.n(o.y);a.n(o.id,0,int(common.sobjectTypes.size())-1);a.n(o.curFrame);a.n(o.animDelay);});
    a.objects(g.bonuses,[&](Bonus& o){a.n(o.x,0,503*65536);a.n(o.y);a.n(o.velY);a.n(o.frame,0,1);a.n(o.timer);a.n(o.weapon,0,39);});
    int limit=int(g.bobjects.limit),count=int(g.bobjects.count);a.n(limit,1,10000);a.n(count,0,limit);
    if(a.in){g.bobjects.resize(limit);g.bobjects.count=count;}
    for(int k=0;k<count;++k){auto& o=g.bobjects.arr[k];a.vec(o.pos);a.vec(o.vel);a.n(o.color,0,255);}
    if(a.in&&a.cursor!=a.data.size())throw std::runtime_error("Trailing checkpoint bytes");
}
static void save(std::vector<unsigned char>& data){Archive a(data,false);archive(a);}
static void restore(std::vector<unsigned char>& data){Archive a(data,true);archive(a);}
}
extern "C" {
EMSCRIPTEN_KEEPALIVE void liero_net_enable(){
    networkMode=true;networkPrediction=false;netstate::audible=session->game.soundPlayer;
    for(auto& s:netstate::saved)s.clear();
    // Canonicalize only storage the original constructors leave inactive.
    auto& g=session->game;
    if(g.settings->gameMode!=Settings::GMHoldazone)g.holdazone.rect=gvl::rect(0,0,0,0);
    for(auto* w:g.worms){if(!w->visible&&!(participants&(1<<w->index)))w->logicRespawn=gvl::ivec2(0,0);
        if(!g.cycles){for(auto& v:w->reacts)v=0;w->steerableSumX=w->steerableSumY=0;}}
}
EMSCRIPTEN_KEEPALIVE int liero_net_save(int slot){
    if(slot<0||slot>1)return 0;try{netstate::save(netstate::saved[slot]);return int(netstate::saved[slot].size());}catch(...){return 0;}
}
EMSCRIPTEN_KEEPALIVE int liero_net_restore(int slot){
    if(slot<0||slot>1||netstate::saved[slot].empty())return 0;
    try{netstate::restore(netstate::saved[slot]);return 1;}catch(...){return 0;}
}
EMSCRIPTEN_KEEPALIVE unsigned char* liero_net_data(int slot){return slot>=0&&slot<2?netstate::saved[slot].data():nullptr;}
EMSCRIPTEN_KEEPALIVE unsigned char* liero_net_buffer(){netstate::transfer.resize(netstate::MaxBytes);return netstate::transfer.data();}
EMSCRIPTEN_KEEPALIVE int liero_net_load(int length){
    if(length<=0||length>int(netstate::MaxBytes))return 0;
    std::vector<unsigned char> backup;netstate::save(backup);netstate::transfer.resize(length);
    try{netstate::restore(netstate::transfer);}catch(std::exception const& e){fprintf(stderr,"%s\n",e.what());netstate::restore(backup);return 0;}
    gfx.playRenderer.origpal=session->game.level.origpal;gfx.playRenderer.origpal.setWormColours(*session->game.settings);
    return 1;
}
EMSCRIPTEN_KEEPALIVE unsigned liero_net_hash(){
    std::vector<unsigned char> data;netstate::save(data);uint32_t h=2166136261u;
    for(auto v:data)h=(h^v)*16777619u;return h;
}
EMSCRIPTEN_KEEPALIVE void liero_net_prediction(int enabled){
    if(enabled&&!networkPrediction){std::memcpy(confirmedDeaths,deaths,sizeof(deaths));std::memcpy(confirmedDeathCount,deathCount,sizeof(deathCount));for(int p=0;p<2;++p)confirmedKills[p]=session->game.worms[p]->kills;}
    networkPrediction=enabled!=0;session->game.soundPlayer=enabled?netstate::silent:netstate::audible;
}
}
